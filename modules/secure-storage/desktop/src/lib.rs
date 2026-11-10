rn_gpui_module::include_specs!();

mod crypto;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use keyring::Entry;
use rn_gpui_module::ModuleError;

const MASTER_KEY: &str = "master-key";
const ITEM_PREFIX: &str = "item:";
const PROBE_SERVICE: &str = "availability";
const PROBE_KEY: &str = "probe";

pub struct SecureStorage;

fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("E_SECURE_STORAGE", message.to_string())
}

fn app_identity() -> String {
    #[cfg(target_os = "macos")]
    if let Some(identifier) = objc2_foundation::NSBundle::mainBundle().bundleIdentifier() {
        return identifier.to_string();
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "app".to_string())
}

fn scoped(app: &str, service: &str) -> Result<String, ModuleError> {
    if service.is_empty() || service.chars().any(|c| c == '/' || c.is_control()) {
        return Err(failure(
            "a service name cannot be empty or contain '/' or control characters",
        ));
    }
    Ok(format!("{app}/{service}"))
}

fn entry(app: &str, service: &str, key: &str) -> Result<Entry, ModuleError> {
    Entry::new(&scoped(app, service)?, key).map_err(failure)
}

fn item_key(key: &str) -> String {
    format!("{ITEM_PREFIX}{key}")
}

fn read_raw(app: &str, service: &str, key: &str) -> Result<Option<String>, ModuleError> {
    match entry(app, service, key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(failure(error)),
    }
}

fn write_raw(app: &str, service: &str, key: &str, value: &str) -> Result<(), ModuleError> {
    entry(app, service, key)?
        .set_password(value)
        .map_err(failure)
}

fn remove_raw(app: &str, service: &str, key: &str) -> Result<bool, ModuleError> {
    match entry(app, service, key)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(failure(error)),
    }
}

fn read(app: &str, service: &str, key: &str) -> Result<Option<String>, ModuleError> {
    read_raw(app, service, &item_key(key))
}

fn write(app: &str, service: &str, key: &str, value: &str) -> Result<(), ModuleError> {
    write_raw(app, service, &item_key(key), value)
}

fn remove(app: &str, service: &str, key: &str) -> Result<bool, ModuleError> {
    remove_raw(app, service, &item_key(key))
}

fn master_key(app: &str, service: &str, create: bool) -> Result<Vec<u8>, ModuleError> {
    if let Some(stored) = read_raw(app, service, MASTER_KEY)? {
        return STANDARD.decode(stored).map_err(failure);
    }
    if !create {
        return Err(failure("the encryption key for this service is gone"));
    }
    let key = crypto::random_key().map_err(failure)?;
    write_raw(app, service, MASTER_KEY, &STANDARD.encode(key))?;
    Ok(key.to_vec())
}

fn is_available(app: &str) -> bool {
    read_raw(app, PROBE_SERVICE, PROBE_KEY).is_ok()
}

impl NativeSecureStorageSpec for SecureStorage {
    fn new(_events: NativeSecureStorageEvents) -> Self {
        Self
    }

    async fn is_available(&self) -> Result<bool, ModuleError> {
        Ok(is_available(&app_identity()))
    }

    async fn set_item(
        &self,
        service: String,
        key: String,
        value: String,
    ) -> Result<(), ModuleError> {
        write(&app_identity(), &service, &key, &value)
    }

    async fn get_item(&self, service: String, key: String) -> Result<Option<String>, ModuleError> {
        read(&app_identity(), &service, &key)
    }

    async fn delete_item(&self, service: String, key: String) -> Result<bool, ModuleError> {
        remove(&app_identity(), &service, &key)
    }

    async fn encrypt_string(
        &self,
        service: String,
        plain_text: String,
    ) -> Result<String, ModuleError> {
        let key = master_key(&app_identity(), &service, true)?;
        let sealed = crypto::seal(&key, plain_text.as_bytes()).map_err(failure)?;
        Ok(STANDARD.encode(sealed))
    }

    async fn decrypt_string(
        &self,
        service: String,
        encrypted: String,
    ) -> Result<String, ModuleError> {
        let data = STANDARD.decode(encrypted).map_err(failure)?;
        let key = master_key(&app_identity(), &service, false)?;
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

    struct Scope(String);

    impl Scope {
        fn new(label: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!(
                "rn-gpui-ss-test-{label}-{}-{nanos}",
                std::process::id()
            ))
        }
    }

    impl Drop for Scope {
        fn drop(&mut self) {
            for service in ["svc", "other"] {
                for key in ["token", "other", MASTER_KEY, &item_key(MASTER_KEY)] {
                    let _ = remove_raw(&self.0, service, key);
                }
                let _ = remove(&self.0, service, "token");
                let _ = remove(&self.0, service, "other");
            }
        }
    }

    #[test]
    fn stores_reads_replaces_and_deletes_an_item_in_the_keychain() {
        let app = Scope::new("a");
        assert_eq!(read(&app.0, "svc", "token").unwrap(), None);
        write(&app.0, "svc", "token", "one").unwrap();
        write(&app.0, "svc", "other", "two").unwrap();
        assert_eq!(
            read(&app.0, "svc", "token").unwrap().as_deref(),
            Some("one")
        );
        write(&app.0, "svc", "token", "three").unwrap();
        assert_eq!(
            read(&app.0, "svc", "token").unwrap().as_deref(),
            Some("three")
        );
        assert_eq!(
            read(&app.0, "svc", "other").unwrap().as_deref(),
            Some("two")
        );
        assert!(remove(&app.0, "svc", "token").unwrap());
        assert!(!remove(&app.0, "svc", "token").unwrap());
        assert_eq!(read(&app.0, "svc", "token").unwrap(), None);
    }

    #[test]
    fn keeps_unicode_and_long_values() {
        let app = Scope::new("u");
        let value = "ключ 日本語 🙂 ".repeat(200);
        write(&app.0, "svc", "token", &value).unwrap();
        assert_eq!(
            read(&app.0, "svc", "token").unwrap().as_deref(),
            Some(value.as_str())
        );
    }

    #[test]
    fn encrypts_with_a_key_that_stays_in_the_keychain() {
        let app = Scope::new("e");
        let first = master_key(&app.0, "svc", true).unwrap();
        assert_eq!(first, master_key(&app.0, "svc", true).unwrap());
        let sealed = crypto::seal(&first, b"hello").unwrap();
        let key = master_key(&app.0, "svc", false).unwrap();
        assert_eq!(crypto::open(&key, &sealed).unwrap(), b"hello");
        assert!(remove_raw(&app.0, "svc", MASTER_KEY).unwrap());
        assert!(master_key(&app.0, "svc", false).is_err());
    }

    #[test]
    fn two_apps_and_two_services_cannot_read_each_other() {
        let one = Scope::new("one");
        let two = Scope::new("two");
        write(&one.0, "svc", "token", "from one").unwrap();
        assert_eq!(read(&two.0, "svc", "token").unwrap(), None);
        assert_eq!(read(&one.0, "other", "token").unwrap(), None);
        write(&two.0, "svc", "token", "from two").unwrap();
        assert_eq!(
            read(&one.0, "svc", "token").unwrap().as_deref(),
            Some("from one")
        );
        let one_key = master_key(&one.0, "svc", true).unwrap();
        let two_key = master_key(&two.0, "svc", true).unwrap();
        assert_ne!(one_key, two_key);
        let sealed = crypto::seal(&one_key, b"secret").unwrap();
        assert!(crypto::open(&two_key, &sealed).is_err());
    }

    #[test]
    fn a_raw_service_name_is_not_reachable_and_the_master_key_is_not_an_item() {
        let app = Scope::new("raw");
        let raw = Entry::new(&format!("{}-raw", app.0), "item:token").unwrap();
        raw.set_password("foreign").unwrap();
        assert_eq!(
            read(&app.0, &format!("{}-raw", app.0), "token").unwrap(),
            None
        );
        raw.delete_credential().unwrap();

        master_key(&app.0, "svc", true).unwrap();
        assert_eq!(read(&app.0, "svc", "master-key").unwrap(), None);
        assert_eq!(read(&app.0, "svc", MASTER_KEY).unwrap(), None);
        write(&app.0, "svc", MASTER_KEY, "not the key").unwrap();
        assert_ne!(
            read_raw(&app.0, "svc", MASTER_KEY).unwrap().as_deref(),
            Some("not the key")
        );
        assert_eq!(master_key(&app.0, "svc", false).unwrap().len(), 32);
    }

    #[test]
    fn service_names_that_could_cross_a_boundary_are_refused() {
        let app = Scope::new("bad");
        for bad in ["", "a/b", "../x", "line\nbreak"] {
            assert!(read(&app.0, bad, "token").is_err(), "{bad:?}");
            assert!(write(&app.0, bad, "token", "x").is_err(), "{bad:?}");
        }
    }

    #[test]
    fn availability_only_reads() {
        let app = Scope::new("avail");
        assert!(is_available(&app.0));
        assert_eq!(read_raw(&app.0, PROBE_SERVICE, PROBE_KEY).unwrap(), None);
    }

    #[test]
    fn the_app_identity_is_not_empty_and_has_no_slash() {
        let identity = app_identity();
        assert!(!identity.is_empty());
        assert!(!identity.contains('/'));
    }
}
