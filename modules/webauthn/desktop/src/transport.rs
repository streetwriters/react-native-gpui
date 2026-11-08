use crate::error::Result;

/// Carries CTAP2 messages to one authenticator.
pub trait Transport: Send {
    /// Sends a CTAP2 request (the command byte followed by its CBOR parameters)
    /// and returns the response (the status byte followed by its CBOR). Calls
    /// `keepalive` with the status the authenticator reports while it works,
    /// which is 2 while it waits for a touch and 1 while it processes.
    fn exchange(&mut self, message: &[u8], keepalive: &mut dyn FnMut(u8)) -> Result<Vec<u8>>;
}
