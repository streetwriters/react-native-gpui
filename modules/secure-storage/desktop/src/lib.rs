rn_gpui_module::include_specs!();

mod crypto;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use keyring::Entry;
use rn_gpui_module::ModuleError;

const MASTER_KEY: &str = "rn-gpui-secure-storage:master-key";
const PROBE_KEY: &str = "rn-gpui-secure-storage:probe";

pub struct SecureStorage;

fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("E_SECURE_STORAGE", message.to_string())
}

fn entry(service: &str, key: &str) -> Result<Entry, ModuleError> {
    Entry::new(service, key).map_err(failure)
}

fn read(service: &str, key: &str) -> Result<Option<String>, ModuleError> {
    match entry(service, key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(failure(error)),
    }
}

fn write(service: &str, key: &str, value: &str) -> Result<(), ModuleError> {
    entry(service, key)?.set_password(value).map_err(failure)
}

fn remove(service: &str, key: &str) -> Result<bool, ModuleError> {
    match entry(service, key)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(failure(error)),
    }
}

fn master_key(service: &str, create: bool) -> Result<Vec<u8>, ModuleError> {
    if let Some(stored) = read(service, MASTER_KEY)? {
        return STANDARD.decode(stored).map_err(failure);
    }
    if !create {
        return Err(failure("the encryption key for this service is gone"));
    }
    let key = crypto::random_key().map_err(failure)?;
    write(service, MASTER_KEY, &STANDARD.encode(key))?;
    Ok(key.to_vec())
}

fn is_available() -> bool {
    let service = "rn-gpui-secure-storage";
    write(service, PROBE_KEY, "1").is_ok()
        && matches!(read(service, PROBE_KEY), Ok(Some(_)))
        && remove(service, PROBE_KEY).is_ok()
}

impl NativeSecureStorageSpec for SecureStorage {
    fn new(_events: NativeSecureStorageEvents) -> Self {
        Self
    }

    async fn is_available(&self) -> Result<bool, ModuleError> {
        Ok(is_available())
    }

    async fn set_item(
        &self,
        service: String,
        key: String,
        value: String,
    ) -> Result<(), ModuleError> {
        write(&service, &key, &value)
    }

    async fn get_item(&self, service: String, key: String) -> Result<Option<String>, ModuleError> {
        read(&service, &key)
    }

    async fn delete_item(&self, service: String, key: String) -> Result<bool, ModuleError> {
        remove(&service, &key)
    }

    async fn encrypt_string(
        &self,
        service: String,
        plain_text: String,
    ) -> Result<String, ModuleError> {
        let key = master_key(&service, true)?;
        let sealed = crypto::seal(&key, plain_text.as_bytes()).map_err(failure)?;
        Ok(STANDARD.encode(sealed))
    }

    async fn decrypt_string(
        &self,
        service: String,
        encrypted: String,
    ) -> Result<String, ModuleError> {
        let data = STANDARD.decode(encrypted).map_err(failure)?;
        let key = master_key(&service, false)?;
        let plain = crypto::open(&key, &data).map_err(failure)?;
        String::from_utf8(plain).map_err(failure)
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_secure_storage_module::<SecureStorage>());
}

#[cfg(all(test, target_os = "macos"))]
mod keychain_tests {
    use super::*;

    struct Service(String);

    impl Service {
        fn new() -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!(
                "rn-gpui-secure-storage-test-{}-{nanos}",
                std::process::id()
            ))
        }
    }

    impl Drop for Service {
        fn drop(&mut self) {
            let _ = remove(&self.0, "token");
            let _ = remove(&self.0, "other");
            let _ = remove(&self.0, MASTER_KEY);
        }
    }

    #[test]
    fn stores_reads_replaces_and_deletes_an_item_in_the_keychain() {
        let service = Service::new();
        assert_eq!(read(&service.0, "token").unwrap(), None);
        write(&service.0, "token", "one").unwrap();
        write(&service.0, "other", "two").unwrap();
        assert_eq!(read(&service.0, "token").unwrap().as_deref(), Some("one"));
        write(&service.0, "token", "three").unwrap();
        assert_eq!(read(&service.0, "token").unwrap().as_deref(), Some("three"));
        assert_eq!(read(&service.0, "other").unwrap().as_deref(), Some("two"));
        assert!(remove(&service.0, "token").unwrap());
        assert!(!remove(&service.0, "token").unwrap());
        assert_eq!(read(&service.0, "token").unwrap(), None);
    }

    #[test]
    fn keeps_unicode_and_long_values() {
        let service = Service::new();
        let value = "ключ 日本語 🙂 ".repeat(200);
        write(&service.0, "token", &value).unwrap();
        assert_eq!(
            read(&service.0, "token").unwrap().as_deref(),
            Some(value.as_str())
        );
    }

    #[test]
    fn encrypts_with_a_key_that_stays_in_the_keychain() {
        let service = Service::new();
        let first = master_key(&service.0, true).unwrap();
        assert_eq!(first, master_key(&service.0, true).unwrap());
        let sealed = crypto::seal(&first, b"hello").unwrap();
        let key = master_key(&service.0, false).unwrap();
        assert_eq!(crypto::open(&key, &sealed).unwrap(), b"hello");
        assert!(remove(&service.0, MASTER_KEY).unwrap());
        assert!(master_key(&service.0, false).is_err());
    }

    #[test]
    fn the_keychain_is_available() {
        assert!(is_available());
    }
}
