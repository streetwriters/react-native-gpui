use ciborium::value::Value;
use p256::ecdh::EphemeralSecret;
use rand_core::OsRng;

use crate::cbor;
use crate::crypto;
use crate::error::{Error, Result};
use crate::transport::Transport;

const MAKE_CREDENTIAL: u8 = 0x01;
const GET_ASSERTION: u8 = 0x02;
const GET_INFO: u8 = 0x04;
const CLIENT_PIN: u8 = 0x06;

const PIN_GET_RETRIES: i64 = 0x01;
const PIN_GET_KEY_AGREEMENT: i64 = 0x02;
const PIN_GET_TOKEN: i64 = 0x05;

pub const STATUS_PROCESSING: u8 = 1;
pub const STATUS_TOUCH: u8 = 2;

/// ES256 then RS256, the algorithms the web app asks for.
pub const ALGORITHMS: [i64; 2] = [-7, -257];

#[derive(Debug, Clone)]
pub struct Info {
    pub versions: Vec<String>,
    pub extensions: Vec<String>,
    /// `Some(true)` when a PIN is set, `Some(false)` when the authenticator
    /// supports one but has none, `None` when it has no PIN support.
    pub client_pin: Option<bool>,
    pub resident_keys: bool,
    pub pin_protocols: Vec<i64>,
}

pub struct MakeRequest<'a> {
    pub rp_id: &'a str,
    pub rp_name: &'a str,
    pub user_id: &'a [u8],
    pub user_name: &'a str,
    pub display_name: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Made {
    pub credential_id: Vec<u8>,
    pub prf_enabled: bool,
}

pub struct PrfRequest<'a> {
    pub rp_id: &'a str,
    pub credential_id: &'a [u8],
    pub salt: &'a [u8],
}

struct PinSession {
    token: Vec<u8>,
    shared: [u8; 32],
    platform_key: Value,
}

pub struct Authenticator<T: Transport> {
    transport: T,
    pub info: Info,
}

fn expect_ok(response: &[u8]) -> Result<&[u8]> {
    match response.split_first() {
        Some((0, body)) => Ok(body),
        Some((status, _)) => Err(Error::from_status(*status)),
        None => Err(Error::Protocol("empty response".into())),
    }
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_text().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

impl<T: Transport> Authenticator<T> {
    pub fn new(mut transport: T) -> Result<Self> {
        let response = transport.exchange(&[GET_INFO], &mut |_| {})?;
        let body = cbor::decode(expect_ok(&response)?)?;
        let options = cbor::get(&body, 4);
        let option = |name: &str| {
            options
                .and_then(|options| cbor::get_text(options, name))
                .and_then(Value::as_bool)
        };
        let info = Info {
            versions: strings(cbor::get(&body, 1)),
            extensions: strings(cbor::get(&body, 2)),
            client_pin: option("clientPin"),
            resident_keys: option("rk").unwrap_or(false),
            pin_protocols: cbor::get(&body, 6)
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_integer().and_then(|n| i64::try_from(n).ok()))
                        .collect()
                })
                .unwrap_or_else(|| vec![1]),
        };
        Ok(Self { transport, info })
    }

    fn require_support(&self) -> Result<()> {
        if !self.info.versions.iter().any(|v| v.starts_with("FIDO_2")) {
            return Err(Error::Unsupported(
                "the security key does not speak CTAP2".into(),
            ));
        }
        if !self.info.extensions.iter().any(|e| e == "hmac-secret") {
            return Err(Error::Unsupported(
                "the security key does not support the hmac-secret extension the PRF needs".into(),
            ));
        }
        if !self.info.resident_keys {
            return Err(Error::Unsupported(
                "the security key cannot store resident credentials".into(),
            ));
        }
        if !self.info.pin_protocols.contains(&1) {
            return Err(Error::Unsupported(
                "the security key lacks PIN protocol 1".into(),
            ));
        }
        match self.info.client_pin {
            None => Err(Error::Unsupported(
                "the security key has no PIN to verify the user with".into(),
            )),
            Some(false) => Err(Error::PinNotSet),
            Some(true) => Ok(()),
        }
    }

    fn call(
        &mut self,
        command: u8,
        params: Option<Value>,
        keepalive: &mut dyn FnMut(u8),
    ) -> Result<Vec<u8>> {
        let mut message = vec![command];
        if let Some(params) = params {
            message.extend(cbor::encode(&params));
        }
        let response = self.transport.exchange(&message, keepalive)?;
        Ok(expect_ok(&response)?.to_vec())
    }

    fn retries(&mut self) -> Option<u32> {
        let params = cbor::map(vec![
            (cbor::int(1), cbor::int(1)),
            (cbor::int(2), cbor::int(PIN_GET_RETRIES)),
        ]);
        let body = self.call(CLIENT_PIN, Some(params), &mut |_| {}).ok()?;
        let body = cbor::decode(&body).ok()?;
        cbor::get(&body, 3)
            .and_then(Value::as_integer)
            .and_then(|n| u32::try_from(n).ok())
    }

    fn pin_session(&mut self, pin: &str) -> Result<PinSession> {
        let params = cbor::map(vec![
            (cbor::int(1), cbor::int(1)),
            (cbor::int(2), cbor::int(PIN_GET_KEY_AGREEMENT)),
        ]);
        let body = self.call(CLIENT_PIN, Some(params), &mut |_| {})?;
        let body = cbor::decode(&body)?;
        let peer = crypto::parse_cose_key(
            cbor::get(&body, 1).ok_or_else(|| Error::Protocol("missing key agreement".into()))?,
        )?;
        let secret = EphemeralSecret::random(&mut OsRng);
        let platform_key = crypto::cose_key(&secret.public_key());
        let shared = crypto::shared_secret(&secret, &peer);
        let pin_hash = crypto::sha256(pin.as_bytes());
        let params = cbor::map(vec![
            (cbor::int(1), cbor::int(1)),
            (cbor::int(2), cbor::int(PIN_GET_TOKEN)),
            (cbor::int(3), platform_key.clone()),
            (
                cbor::int(6),
                cbor::bytes(&crypto::encrypt(&shared, &pin_hash[..16])),
            ),
        ]);
        let body = match self.call(CLIENT_PIN, Some(params), &mut |_| {}) {
            Ok(body) => body,
            Err(Error::PinInvalid { .. }) => {
                return Err(Error::PinInvalid {
                    retries: self.retries(),
                })
            }
            Err(other) => return Err(other),
        };
        let body = cbor::decode(&body)?;
        let token = crypto::decrypt(&shared, &cbor::as_bytes(cbor::get(&body, 2), "PIN token")?)?;
        Ok(PinSession {
            token,
            shared,
            platform_key,
        })
    }

    fn pin_auth(session: &PinSession, client_data_hash: &[u8]) -> Value {
        cbor::bytes(&crypto::hmac256(&session.token, client_data_hash)[..16])
    }

    /// Creates a resident credential with the hmac-secret extension and the
    /// user verified by PIN.
    pub fn make_credential(
        &mut self,
        request: &MakeRequest,
        pin: Option<&str>,
        keepalive: &mut dyn FnMut(u8),
    ) -> Result<Made> {
        self.require_support()?;
        let pin = pin.ok_or(Error::PinRequired)?;
        let session = self.pin_session(pin)?;
        let client_data_hash = crypto::sha256(&random_bytes::<32>());
        let params = cbor::map(vec![
            (cbor::int(1), cbor::bytes(&client_data_hash)),
            (
                cbor::int(2),
                cbor::map(vec![
                    (cbor::text("id"), cbor::text(request.rp_id)),
                    (cbor::text("name"), cbor::text(request.rp_name)),
                ]),
            ),
            (
                cbor::int(3),
                cbor::map(vec![
                    (cbor::text("id"), cbor::bytes(request.user_id)),
                    (cbor::text("name"), cbor::text(request.user_name)),
                    (cbor::text("displayName"), cbor::text(request.display_name)),
                ]),
            ),
            (
                cbor::int(4),
                Value::Array(
                    ALGORITHMS
                        .iter()
                        .map(|alg| {
                            cbor::map(vec![
                                (cbor::text("alg"), cbor::int(*alg)),
                                (cbor::text("type"), cbor::text("public-key")),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                cbor::int(6),
                cbor::map(vec![(cbor::text("hmac-secret"), Value::Bool(true))]),
            ),
            (
                cbor::int(7),
                cbor::map(vec![(cbor::text("rk"), Value::Bool(true))]),
            ),
            (cbor::int(8), Self::pin_auth(&session, &client_data_hash)),
            (cbor::int(9), cbor::int(1)),
        ]);
        let body = self.call(MAKE_CREDENTIAL, Some(params), keepalive)?;
        let body = cbor::decode(&body)?;
        let auth_data = cbor::as_bytes(cbor::get(&body, 2), "authenticator data")?;
        let parsed = parse_auth_data(&auth_data)?;
        if parsed.rp_id_hash != crypto::sha256(request.rp_id.as_bytes()) {
            return Err(Error::Protocol(
                "the relying party hash does not match".into(),
            ));
        }
        if parsed.flags & 0x04 == 0 {
            return Err(Error::Protocol("the user was not verified".into()));
        }
        let credential_id = parsed
            .credential_id
            .ok_or_else(|| Error::Protocol("no credential in the response".into()))?;
        let prf_enabled = parsed
            .extensions
            .as_ref()
            .and_then(|extensions| cbor::get_text(extensions, "hmac-secret"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        Ok(Made {
            credential_id,
            prf_enabled,
        })
    }

    /// Evaluates the PRF for a salt: the 32 bytes a browser reports as
    /// `prf.results.first`.
    pub fn get_prf(
        &mut self,
        request: &PrfRequest,
        pin: Option<&str>,
        keepalive: &mut dyn FnMut(u8),
    ) -> Result<[u8; 32]> {
        self.require_support()?;
        let pin = pin.ok_or(Error::PinRequired)?;
        let session = self.pin_session(pin)?;
        let client_data_hash = crypto::sha256(&random_bytes::<32>());
        let salt_enc = crypto::encrypt(&session.shared, &crypto::prf_salt(request.salt));
        let salt_auth = &crypto::hmac256(&session.shared, &salt_enc)[..16];
        let params = cbor::map(vec![
            (cbor::int(1), cbor::text(request.rp_id)),
            (cbor::int(2), cbor::bytes(&client_data_hash)),
            (
                cbor::int(3),
                Value::Array(vec![cbor::map(vec![
                    (cbor::text("id"), cbor::bytes(request.credential_id)),
                    (cbor::text("type"), cbor::text("public-key")),
                ])]),
            ),
            (
                cbor::int(4),
                cbor::map(vec![(
                    cbor::text("hmac-secret"),
                    cbor::map(vec![
                        (cbor::int(1), session.platform_key.clone()),
                        (cbor::int(2), cbor::bytes(&salt_enc)),
                        (cbor::int(3), cbor::bytes(salt_auth)),
                    ]),
                )]),
            ),
            (cbor::int(6), Self::pin_auth(&session, &client_data_hash)),
            (cbor::int(7), cbor::int(1)),
        ]);
        let body = self.call(GET_ASSERTION, Some(params), keepalive)?;
        let body = cbor::decode(&body)?;
        let auth_data = cbor::as_bytes(cbor::get(&body, 2), "authenticator data")?;
        let parsed = parse_auth_data(&auth_data)?;
        if parsed.rp_id_hash != crypto::sha256(request.rp_id.as_bytes()) {
            return Err(Error::Protocol(
                "the relying party hash does not match".into(),
            ));
        }
        if parsed.flags & 0x04 == 0 {
            return Err(Error::Protocol("the user was not verified".into()));
        }
        let encrypted = parsed
            .extensions
            .as_ref()
            .and_then(|extensions| cbor::get_text(extensions, "hmac-secret"))
            .and_then(Value::as_bytes)
            .ok_or_else(|| Error::Protocol("the response has no hmac-secret output".into()))?;
        let output = crypto::decrypt(&session.shared, encrypted)?;
        output
            .get(..32)
            .and_then(|slice| <[u8; 32]>::try_from(slice).ok())
            .ok_or_else(|| Error::Protocol("the hmac-secret output is short".into()))
    }
}

pub struct AuthData {
    pub rp_id_hash: [u8; 32],
    pub flags: u8,
    pub credential_id: Option<Vec<u8>>,
    pub extensions: Option<Value>,
}

pub fn parse_auth_data(data: &[u8]) -> Result<AuthData> {
    let short = || Error::Protocol("authenticator data is short".into());
    if data.len() < 37 {
        return Err(short());
    }
    let rp_id_hash: [u8; 32] = data[..32].try_into().expect("32 bytes");
    let flags = data[32];
    let mut at = 37;
    let mut credential_id = None;
    if flags & 0x40 != 0 {
        let length = data.get(at + 16..at + 18).ok_or_else(short)?;
        let length = usize::from(u16::from_be_bytes([length[0], length[1]]));
        at += 18;
        credential_id = Some(data.get(at..at + length).ok_or_else(short)?.to_vec());
        at += length;
        let (_, used) = cbor::decode_prefix(data.get(at..).ok_or_else(short)?)?;
        at += used;
    }
    let extensions = if flags & 0x80 != 0 {
        Some(cbor::decode(data.get(at..).ok_or_else(short)?)?)
    } else {
        None
    };
    Ok(AuthData {
        rp_id_hash,
        flags,
        credential_id,
        extensions,
    })
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    use rand_core::RngCore;
    let mut bytes = [0u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}
