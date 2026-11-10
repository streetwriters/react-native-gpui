use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

const VERSION: u8 = 1;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub fn random_key() -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    getrandom::getrandom(&mut key).map_err(|error| format!("no random bytes: {error}"))?;
    Ok(key)
}

pub fn seal(key: &[u8], plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "the key is not 32 bytes")?;
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut nonce).map_err(|error| format!("no random bytes: {error}"))?;
    let sealed = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|_| "encryption failed")?;
    let mut out = Vec::with_capacity(1 + NONCE_LEN + sealed.len());
    out.push(VERSION);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    Ok(out)
}

pub fn open(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 1 + NONCE_LEN + TAG_LEN || data[0] != VERSION {
        return Err("the data was not made by encryptString".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "the key is not 32 bytes")?;
    cipher
        .decrypt(
            Nonce::from_slice(&data[1..1 + NONCE_LEN]),
            &data[1 + NONCE_LEN..],
        )
        .map_err(|_| "the data was changed or belongs to another key".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_uses_a_new_nonce_each_time() {
        let key = random_key().unwrap();
        let a = seal(&key, "héllo 日本".as_bytes()).unwrap();
        let b = seal(&key, "héllo 日本".as_bytes()).unwrap();
        assert_ne!(a, b);
        assert_eq!(open(&key, &a).unwrap(), "héllo 日本".as_bytes());
    }

    #[test]
    fn refuses_changed_data_another_key_and_foreign_bytes() {
        let key = random_key().unwrap();
        let mut sealed = seal(&key, b"secret").unwrap();
        assert!(open(&random_key().unwrap(), &sealed).is_err());
        *sealed.last_mut().unwrap() ^= 1;
        assert!(open(&key, &sealed).is_err());
        assert!(open(&key, b"short").is_err());
        let mut wrong_version = seal(&key, b"x").unwrap();
        wrong_version[0] = 9;
        assert!(open(&key, &wrong_version).is_err());
    }
}
