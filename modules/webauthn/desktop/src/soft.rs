//! A software CTAP2 authenticator that speaks the same messages a security key
//! does: getInfo, clientPIN (PIN protocol 1), makeCredential with resident
//! keys and getAssertion with the hmac-secret extension.

use std::sync::{Arc, Mutex};

use ciborium::value::Value;
use p256::ecdsa::{signature::Signer, Signature, SigningKey};
use p256::SecretKey;
use rand_core::OsRng;

use crate::cbor;
use crate::crypto;
use crate::ctap::{random_bytes, STATUS_PROCESSING, STATUS_TOUCH};
use crate::error::{Error, Result};
use crate::transport::Transport;

const PIN_TRIES: u32 = 8;

struct Credential {
    id: Vec<u8>,
    rp_id: String,
    signing_key: SigningKey,
    secret_with_uv: [u8; 32],
    counter: u32,
}

struct State {
    pin_hash: Option<[u8; 16]>,
    retries: u32,
    key_agreement: SecretKey,
    pin_token: [u8; 32],
    credentials: Vec<Credential>,
    hmac_secret: bool,
    touches: u32,
}

/// The authenticator's state is shared, so several transports opened to it
/// (one per request, as with a device) see the same credentials.
#[derive(Clone)]
pub struct SoftAuthenticator {
    state: Arc<Mutex<State>>,
}

impl SoftAuthenticator {
    pub fn new(pin: &str) -> Self {
        Self::build(Some(pin), true)
    }

    /// An authenticator without the hmac-secret extension.
    pub fn without_hmac_secret(pin: &str) -> Self {
        Self::build(Some(pin), false)
    }

    pub fn without_pin() -> Self {
        Self::build(None, true)
    }

    fn build(pin: Option<&str>, hmac_secret: bool) -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                pin_hash: pin.map(|pin| crypto::sha256(pin.as_bytes())[..16].try_into().unwrap()),
                retries: PIN_TRIES,
                key_agreement: SecretKey::random(&mut OsRng),
                pin_token: random_bytes::<32>(),
                credentials: Vec::new(),
                hmac_secret,
                touches: 0,
            })),
        }
    }

    /// How many times the user was asked to touch the key.
    pub fn touches(&self) -> u32 {
        self.state.lock().unwrap().touches
    }

    pub fn credential_count(&self) -> usize {
        self.state.lock().unwrap().credentials.len()
    }
}

fn status(code: u8) -> Vec<u8> {
    vec![code]
}

fn ok(body: Value) -> Vec<u8> {
    let mut out = vec![0];
    out.extend(cbor::encode(&body));
    out
}

impl Transport for SoftAuthenticator {
    fn exchange(&mut self, message: &[u8], keepalive: &mut dyn FnMut(u8)) -> Result<Vec<u8>> {
        let (&command, rest) = message
            .split_first()
            .ok_or_else(|| Error::Protocol("empty request".into()))?;
        let mut state = self.state.lock().unwrap();
        keepalive(STATUS_PROCESSING);
        let params = if rest.is_empty() {
            Value::Null
        } else {
            cbor::decode(rest)?
        };
        Ok(match command {
            0x04 => state.get_info(),
            0x06 => state.client_pin(&params),
            0x01 => state.make_credential(&params, keepalive),
            0x02 => state.get_assertion(&params, keepalive),
            _ => status(0x01),
        })
    }
}

impl State {
    fn get_info(&self) -> Vec<u8> {
        let mut extensions = Vec::new();
        if self.hmac_secret {
            extensions.push(cbor::text("hmac-secret"));
        }
        ok(cbor::map(vec![
            (cbor::int(1), Value::Array(vec![cbor::text("FIDO_2_0")])),
            (cbor::int(2), Value::Array(extensions)),
            (cbor::int(3), cbor::bytes(&[7; 16])),
            (
                cbor::int(4),
                cbor::map(vec![
                    (cbor::text("rk"), Value::Bool(true)),
                    (cbor::text("up"), Value::Bool(true)),
                    (cbor::text("plat"), Value::Bool(false)),
                    (
                        cbor::text("clientPin"),
                        Value::Bool(self.pin_hash.is_some()),
                    ),
                ]),
            ),
            (cbor::int(6), Value::Array(vec![cbor::int(1)])),
        ]))
    }

    fn shared_secret(&self, platform_key: &Value) -> std::result::Result<[u8; 32], u8> {
        let peer = crypto::parse_cose_key(platform_key).map_err(|_| 0x36u8)?;
        let shared =
            p256::ecdh::diffie_hellman(self.key_agreement.to_nonzero_scalar(), peer.as_affine());
        Ok(crypto::sha256(shared.raw_secret_bytes().as_slice()))
    }

    fn client_pin(&mut self, params: &Value) -> Vec<u8> {
        let sub = cbor::get(params, 2)
            .and_then(Value::as_integer)
            .and_then(|n| i64::try_from(n).ok());
        match sub {
            Some(0x01) => ok(cbor::map(vec![(
                cbor::int(3),
                cbor::int(self.retries.into()),
            )])),
            Some(0x02) => ok(cbor::map(vec![(
                cbor::int(1),
                crypto::cose_key(&self.key_agreement.public_key()),
            )])),
            Some(0x05) => {
                let Some(pin_hash) = self.pin_hash else {
                    return status(0x35);
                };
                if self.retries == 0 {
                    return status(0x32);
                }
                let Some(platform_key) = cbor::get(params, 3) else {
                    return status(0x14);
                };
                let Ok(shared) = self.shared_secret(platform_key) else {
                    return status(0x14);
                };
                let Some(encrypted) = cbor::get(params, 6).and_then(Value::as_bytes) else {
                    return status(0x14);
                };
                let Ok(sent) = crypto::decrypt(&shared, encrypted) else {
                    return status(0x14);
                };
                if sent != pin_hash {
                    self.retries -= 1;
                    return status(0x31);
                }
                self.retries = PIN_TRIES;
                self.pin_token = random_bytes::<32>();
                ok(cbor::map(vec![(
                    cbor::int(2),
                    cbor::bytes(&crypto::encrypt(&shared, &self.pin_token)),
                )]))
            }
            _ => status(0x01),
        }
    }

    fn verified(
        &self,
        params: &Value,
        hash_key: i64,
        auth_key: i64,
    ) -> std::result::Result<(), u8> {
        let hash = cbor::get(params, hash_key)
            .and_then(Value::as_bytes)
            .ok_or(0x14u8)?;
        let Some(auth) = cbor::get(params, auth_key).and_then(Value::as_bytes) else {
            return Err(0x36);
        };
        if crypto::hmac256(&self.pin_token, hash)[..16] == auth[..] {
            Ok(())
        } else {
            Err(0x33)
        }
    }

    fn touch(&mut self, keepalive: &mut dyn FnMut(u8)) {
        keepalive(STATUS_TOUCH);
        self.touches += 1;
    }

    fn make_credential(&mut self, params: &Value, keepalive: &mut dyn FnMut(u8)) -> Vec<u8> {
        if let Err(code) = self.verified(params, 1, 8) {
            return status(code);
        }
        let Some(rp_id) = cbor::get(params, 2)
            .and_then(|rp| cbor::get_text(rp, "id"))
            .and_then(Value::as_text)
            .map(str::to_owned)
        else {
            return status(0x14);
        };
        let algorithms: Vec<i64> = cbor::get(params, 4)
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|item| cbor::get_text(item, "alg")?.as_integer()?.try_into().ok())
                    .collect()
            })
            .unwrap_or_default();
        if !algorithms.contains(&-7) {
            return status(0x26);
        }
        let wants_hmac = cbor::get(params, 6)
            .and_then(|extensions| cbor::get_text(extensions, "hmac-secret"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if wants_hmac && !self.hmac_secret {
            return status(0x2B);
        }
        self.touch(keepalive);
        let signing_key = SigningKey::random(&mut OsRng);
        let id = random_bytes::<32>().to_vec();
        let point = crypto::cose_key(&p256::PublicKey::from(signing_key.verifying_key()));
        let public = cbor::map(vec![
            (cbor::int(1), cbor::int(2)),
            (cbor::int(3), cbor::int(-7)),
            (cbor::int(-1), cbor::int(1)),
            (cbor::int(-2), cbor::get(&point, -2).cloned().unwrap()),
            (cbor::int(-3), cbor::get(&point, -3).cloned().unwrap()),
        ]);
        let mut auth = crypto::sha256(rp_id.as_bytes()).to_vec();
        auth.push(0x45 | if wants_hmac { 0x80 } else { 0 });
        auth.extend_from_slice(&0u32.to_be_bytes());
        auth.extend_from_slice(&[7; 16]);
        auth.extend_from_slice(&(id.len() as u16).to_be_bytes());
        auth.extend_from_slice(&id);
        auth.extend(cbor::encode(&public));
        if wants_hmac {
            auth.extend(cbor::encode(&cbor::map(vec![(
                cbor::text("hmac-secret"),
                Value::Bool(true),
            )])));
        }
        self.credentials.push(Credential {
            id,
            rp_id,
            signing_key,
            secret_with_uv: random_bytes::<32>(),
            counter: 0,
        });
        ok(cbor::map(vec![
            (cbor::int(1), cbor::text("none")),
            (cbor::int(2), cbor::bytes(&auth)),
            (cbor::int(3), cbor::map(vec![])),
        ]))
    }

    fn get_assertion(&mut self, params: &Value, keepalive: &mut dyn FnMut(u8)) -> Vec<u8> {
        if let Err(code) = self.verified(params, 2, 6) {
            return status(code);
        }
        let Some(rp_id) = cbor::get(params, 1)
            .and_then(Value::as_text)
            .map(str::to_owned)
        else {
            return status(0x14);
        };
        let allowed: Vec<Vec<u8>> = cbor::get(params, 3)
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|item| cbor::get_text(item, "id")?.as_bytes().cloned())
                    .collect()
            })
            .unwrap_or_default();
        let hash = cbor::get(params, 2)
            .and_then(Value::as_bytes)
            .cloned()
            .unwrap_or_default();
        let found = self
            .credentials
            .iter()
            .position(|c| c.rp_id == rp_id && (allowed.is_empty() || allowed.contains(&c.id)));
        let Some(index) = found else {
            return status(0x2E);
        };

        let hmac_input = cbor::get(params, 4).and_then(|e| cbor::get_text(e, "hmac-secret"));
        let mut extension_output = None;
        if let Some(input) = hmac_input {
            if !self.hmac_secret {
                return status(0x2B);
            }
            let Some(platform_key) = cbor::get(input, 1) else {
                return status(0x14);
            };
            let Ok(shared) = self.shared_secret(platform_key) else {
                return status(0x14);
            };
            let salt_enc = cbor::get(input, 2)
                .and_then(Value::as_bytes)
                .cloned()
                .unwrap_or_default();
            let salt_auth = cbor::get(input, 3)
                .and_then(Value::as_bytes)
                .cloned()
                .unwrap_or_default();
            if crypto::hmac256(&shared, &salt_enc)[..16] != salt_auth[..] {
                return status(0x33);
            }
            let Ok(salts) = crypto::decrypt(&shared, &salt_enc) else {
                return status(0x14);
            };
            if salts.len() != 32 && salts.len() != 64 {
                return status(0x14);
            }
            let secret = self.credentials[index].secret_with_uv;
            let mut output = Vec::new();
            for salt in salts.chunks(32) {
                output.extend_from_slice(&crypto::hmac256(&secret, salt));
            }
            extension_output = Some(crypto::encrypt(&shared, &output));
        }

        self.touch(keepalive);
        let credential = &mut self.credentials[index];
        credential.counter += 1;
        let mut auth = crypto::sha256(rp_id.as_bytes()).to_vec();
        auth.push(0x05 | if extension_output.is_some() { 0x80 } else { 0 });
        auth.extend_from_slice(&credential.counter.to_be_bytes());
        if let Some(output) = &extension_output {
            auth.extend(cbor::encode(&cbor::map(vec![(
                cbor::text("hmac-secret"),
                cbor::bytes(output),
            )])));
        }
        let mut signed = auth.clone();
        signed.extend_from_slice(&hash);
        let signature: Signature = credential.signing_key.sign(&signed);
        ok(cbor::map(vec![
            (
                cbor::int(1),
                cbor::map(vec![
                    (cbor::text("id"), cbor::bytes(&credential.id)),
                    (cbor::text("type"), cbor::text("public-key")),
                ]),
            ),
            (cbor::int(2), cbor::bytes(&auth)),
            (cbor::int(3), cbor::bytes(signature.to_der().as_bytes())),
        ]))
    }
}

impl SoftAuthenticator {
    /// What the hmac-secret extension returns for a salt, computed directly,
    /// so a test can check the protocol did not alter the secret.
    #[cfg(test)]
    pub fn expected_prf(&self, credential_id: &[u8], salt: &[u8; 32]) -> [u8; 32] {
        let state = self.state.lock().unwrap();
        let credential = state
            .credentials
            .iter()
            .find(|credential| credential.id == credential_id)
            .expect("the credential exists");
        crypto::hmac256(&credential.secret_with_uv, salt)
    }
}
