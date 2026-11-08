use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use ciborium::value::Value;
use hmac::{Hmac, Mac};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::PublicKey;
use sha2::{Digest, Sha256};

use crate::cbor;
use crate::error::{Error, Result};

pub fn sha256(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

pub fn hmac256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(data);
    mac.finalize().into_bytes().into()
}

const ZERO_IV: [u8; 16] = [0; 16];

/// AES-256-CBC with a zero IV and no padding, as CTAP2 PIN protocol 1 uses.
pub fn encrypt(key: &[u8; 32], data: &[u8]) -> Vec<u8> {
    cbc::Encryptor::<aes::Aes256>::new(key.into(), &ZERO_IV.into())
        .encrypt_padded_vec_mut::<NoPadding>(data)
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    cbc::Decryptor::<aes::Aes256>::new(key.into(), &ZERO_IV.into())
        .decrypt_padded_vec_mut::<NoPadding>(data)
        .map_err(|_| Error::Protocol("bad ciphertext length".into()))
}

/// The salt WebAuthn's PRF extension hands the authenticator for an input.
pub fn prf_salt(input: &[u8]) -> [u8; 32] {
    let mut data = b"WebAuthn PRF\0".to_vec();
    data.extend_from_slice(input);
    sha256(&data)
}

pub fn cose_key(public: &PublicKey) -> Value {
    let point = public.to_encoded_point(false);
    cbor::map(vec![
        (cbor::int(1), cbor::int(2)),
        (cbor::int(3), cbor::int(-25)),
        (cbor::int(-1), cbor::int(1)),
        (
            cbor::int(-2),
            cbor::bytes(point.x().expect("uncompressed point")),
        ),
        (
            cbor::int(-3),
            cbor::bytes(point.y().expect("uncompressed point")),
        ),
    ])
}

pub fn parse_cose_key(value: &Value) -> Result<PublicKey> {
    let x = cbor::as_bytes(cbor::get(value, -2), "key x")?;
    let y = cbor::as_bytes(cbor::get(value, -3), "key y")?;
    if x.len() != 32 || y.len() != 32 {
        return Err(Error::Protocol("bad key coordinates".into()));
    }
    let mut sec1 = vec![4];
    sec1.extend_from_slice(&x);
    sec1.extend_from_slice(&y);
    PublicKey::from_sec1_bytes(&sec1).map_err(|_| Error::Protocol("key is not on the curve".into()))
}

/// PIN protocol 1's shared secret: the hash of the ECDH x coordinate.
pub fn shared_secret(secret: &p256::ecdh::EphemeralSecret, peer: &PublicKey) -> [u8; 32] {
    sha256(secret.diffie_hellman(peer).raw_secret_bytes().as_slice())
}
