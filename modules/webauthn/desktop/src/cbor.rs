use ciborium::value::{Integer, Value};

use crate::error::{Error, Result};

pub fn int(value: i64) -> Value {
    Value::Integer(Integer::from(value))
}

pub fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

pub fn bytes(value: &[u8]) -> Value {
    Value::Bytes(value.to_vec())
}

pub fn encode(value: &Value) -> Vec<u8> {
    let mut out = Vec::new();
    ciborium::into_writer(value, &mut out).expect("writing to a vector");
    out
}

/// A map with its keys in the canonical order CTAP2 asks for: shorter
/// encodings first, then bytewise.
pub fn map(entries: Vec<(Value, Value)>) -> Value {
    let mut keyed: Vec<(Vec<u8>, (Value, Value))> = entries
        .into_iter()
        .map(|entry| (encode(&entry.0), entry))
        .collect();
    keyed.sort_by(|a, b| a.0.len().cmp(&b.0.len()).then_with(|| a.0.cmp(&b.0)));
    Value::Map(keyed.into_iter().map(|(_, entry)| entry).collect())
}

pub fn decode(input: &[u8]) -> Result<Value> {
    let (value, used) = decode_prefix(input)?;
    if used != input.len() {
        return Err(Error::Protocol("trailing bytes after CBOR".into()));
    }
    Ok(value)
}

/// Decodes the first CBOR item and says how many bytes it took.
pub fn decode_prefix(input: &[u8]) -> Result<(Value, usize)> {
    let mut cursor = std::io::Cursor::new(input);
    let value: Value = ciborium::from_reader(&mut cursor)
        .map_err(|error| Error::Protocol(format!("bad CBOR: {error}")))?;
    Ok((value, cursor.position() as usize))
}

pub fn get(map: &Value, key: i64) -> Option<&Value> {
    map.as_map()?
        .iter()
        .find(|(k, _)| k.as_integer().and_then(|k| i64::try_from(k).ok()) == Some(key))
        .map(|(_, value)| value)
}

pub fn get_text<'a>(map: &'a Value, key: &str) -> Option<&'a Value> {
    map.as_map()?
        .iter()
        .find(|(k, _)| k.as_text() == Some(key))
        .map(|(_, value)| value)
}

pub fn as_bytes(value: Option<&Value>, what: &str) -> Result<Vec<u8>> {
    value
        .and_then(Value::as_bytes)
        .cloned()
        .ok_or_else(|| Error::Protocol(format!("missing {what}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_are_canonical_and_prefixes_are_measured() {
        let value = map(vec![
            (text("rk"), Value::Bool(true)),
            (int(-2), bytes(&[1])),
            (int(3), int(1)),
            (int(1), int(2)),
        ]);
        let keys: Vec<_> = value
            .as_map()
            .unwrap()
            .iter()
            .map(|(k, _)| k.clone())
            .collect();
        assert_eq!(keys, vec![int(1), int(3), int(-2), text("rk")]);
        let mut data = encode(&value);
        let length = data.len();
        data.extend_from_slice(&[0xAA, 0xBB]);
        let (decoded, used) = decode_prefix(&data).unwrap();
        assert_eq!(decoded, value);
        assert_eq!(used, length);
    }
}
