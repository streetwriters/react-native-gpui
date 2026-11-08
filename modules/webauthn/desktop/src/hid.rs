//! CTAPHID over USB: the 64 byte packets a FIDO security key speaks.

use std::time::{Duration, Instant};

use crate::error::{Error, Result};
use crate::transport::Transport;

pub const PACKET: usize = 64;
const INIT_DATA: usize = PACKET - 7;
const CONT_DATA: usize = PACKET - 5;

const BROADCAST: u32 = 0xFFFF_FFFF;
const CMD_INIT: u8 = 0x06;
const CMD_CBOR: u8 = 0x10;
const CMD_KEEPALIVE: u8 = 0x3B;
const CMD_ERROR: u8 = 0x3F;
const CAPABILITY_CBOR: u8 = 0x04;

const FIDO_USAGE_PAGE: u16 = 0xF1D0;
const FIDO_USAGE: u16 = 0x01;

/// Splits a message into the packets CTAPHID sends it in.
pub fn pack(cid: u32, command: u8, data: &[u8]) -> Vec<[u8; PACKET]> {
    let mut packets = Vec::new();
    let mut packet = [0u8; PACKET];
    packet[..4].copy_from_slice(&cid.to_be_bytes());
    packet[4] = command | 0x80;
    packet[5..7].copy_from_slice(&(data.len() as u16).to_be_bytes());
    let first = data.len().min(INIT_DATA);
    packet[7..7 + first].copy_from_slice(&data[..first]);
    packets.push(packet);
    for (sequence, chunk) in data[first..].chunks(CONT_DATA).enumerate() {
        let mut packet = [0u8; PACKET];
        packet[..4].copy_from_slice(&cid.to_be_bytes());
        packet[4] = sequence as u8;
        packet[5..5 + chunk.len()].copy_from_slice(chunk);
        packets.push(packet);
    }
    packets
}

/// Puts the packets of one message back together.
pub struct Assembler {
    cid: u32,
    command: u8,
    length: usize,
    data: Vec<u8>,
    sequence: u8,
    started: bool,
}

impl Assembler {
    pub fn new(cid: u32) -> Self {
        Self {
            cid,
            command: 0,
            length: 0,
            data: Vec::new(),
            sequence: 0,
            started: false,
        }
    }

    /// Takes a packet; returns the command and data once the message is whole.
    /// Packets for another channel are skipped.
    pub fn push(&mut self, packet: &[u8]) -> Result<Option<(u8, Vec<u8>)>> {
        if packet.len() < PACKET {
            return Err(Error::Transport("short packet".into()));
        }
        if u32::from_be_bytes(packet[..4].try_into().unwrap()) != self.cid {
            return Ok(None);
        }
        if packet[4] & 0x80 != 0 {
            let command = packet[4] & 0x7F;
            if command == CMD_KEEPALIVE {
                return Ok(Some((command, vec![packet[7]])));
            }
            self.command = command;
            self.length = usize::from(u16::from_be_bytes([packet[5], packet[6]]));
            self.data = packet[7..7 + self.length.min(INIT_DATA)].to_vec();
            self.sequence = 0;
            self.started = true;
        } else {
            if !self.started || packet[4] != self.sequence {
                return Err(Error::Transport("packet out of order".into()));
            }
            self.sequence = self.sequence.wrapping_add(1);
            let missing = self.length - self.data.len();
            self.data
                .extend_from_slice(&packet[5..5 + missing.min(CONT_DATA)]);
        }
        if self.started && self.data.len() >= self.length {
            self.started = false;
            return Ok(Some((self.command, std::mem::take(&mut self.data))));
        }
        Ok(None)
    }
}

pub struct HidTransport {
    device: hidapi::HidDevice,
    cid: u32,
}

fn io(error: impl std::fmt::Display) -> Error {
    Error::Transport(error.to_string())
}

impl HidTransport {
    fn send(&self, cid: u32, command: u8, data: &[u8]) -> Result<()> {
        for packet in pack(cid, command, data) {
            let mut report = vec![0u8];
            report.extend_from_slice(&packet);
            self.device.write(&report).map_err(io)?;
        }
        Ok(())
    }

    fn receive(
        &self,
        cid: u32,
        deadline: Instant,
        keepalive: &mut dyn FnMut(u8),
    ) -> Result<(u8, Vec<u8>)> {
        let mut assembler = Assembler::new(cid);
        let mut buffer = [0u8; PACKET];
        loop {
            if Instant::now() > deadline {
                return Err(Error::Timeout);
            }
            let read = self.device.read_timeout(&mut buffer, 100).map_err(io)?;
            if read == 0 {
                continue;
            }
            if let Some((command, data)) = assembler.push(&buffer[..read])? {
                match command {
                    CMD_KEEPALIVE => keepalive(data.first().copied().unwrap_or(0)),
                    _ => return Ok((command, data)),
                }
            }
        }
    }

    fn open(device: hidapi::HidDevice) -> Result<Self> {
        let mut transport = Self {
            device,
            cid: BROADCAST,
        };
        let nonce: [u8; 8] = crate::ctap::random_bytes();
        transport.send(BROADCAST, CMD_INIT, &nonce)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            let (command, data) = transport.receive(BROADCAST, deadline, &mut |_| {})?;
            if command == CMD_INIT && data.len() >= 17 && data[..8] == nonce {
                transport.cid = u32::from_be_bytes(data[8..12].try_into().unwrap());
                if data[16] & CAPABILITY_CBOR == 0 {
                    return Err(Error::Unsupported("the device does not speak CTAP2".into()));
                }
                return Ok(transport);
            }
        }
    }
}

/// Every FIDO security key plugged in that answers CTAPHID.
pub fn open_all() -> Result<Vec<HidTransport>> {
    let api = hidapi::HidApi::new().map_err(io)?;
    let mut found = Vec::new();
    for info in api.device_list() {
        if info.usage_page() != FIDO_USAGE_PAGE || info.usage() != FIDO_USAGE {
            continue;
        }
        if let Ok(device) = info.open_device(&api) {
            if let Ok(transport) = HidTransport::open(device) {
                found.push(transport);
            }
        }
    }
    Ok(found)
}

impl Transport for HidTransport {
    fn exchange(&mut self, message: &[u8], keepalive: &mut dyn FnMut(u8)) -> Result<Vec<u8>> {
        self.send(self.cid, CMD_CBOR, message)?;
        let deadline = Instant::now() + Duration::from_secs(60);
        let (command, data) = self.receive(self.cid, deadline, keepalive)?;
        match command {
            CMD_CBOR => Ok(data),
            CMD_ERROR => Err(Error::Transport(format!(
                "CTAPHID error 0x{:02x}",
                data.first().copied().unwrap_or(0)
            ))),
            other => Err(Error::Protocol(format!("unexpected command 0x{other:02x}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_message_survives_packing() {
        let data: Vec<u8> = (0..300u16).map(|n| n as u8).collect();
        let packets = pack(0x0102_0304, CMD_CBOR, &data);
        assert_eq!(
            packets.len(),
            1 + (300 - INIT_DATA + CONT_DATA - 1) / CONT_DATA
        );
        let mut assembler = Assembler::new(0x0102_0304);
        let mut result = None;
        for packet in &packets {
            result = assembler.push(packet).unwrap();
        }
        assert_eq!(result, Some((CMD_CBOR, data)));
    }

    #[test]
    fn other_channels_and_keepalives_are_told_apart() {
        let other = pack(9, CMD_CBOR, &[1, 2, 3]);
        let mut assembler = Assembler::new(1);
        assert_eq!(assembler.push(&other[0]).unwrap(), None);
        let keepalive = pack(1, CMD_KEEPALIVE, &[2]);
        assert_eq!(
            assembler.push(&keepalive[0]).unwrap(),
            Some((CMD_KEEPALIVE, vec![2]))
        );
    }

    #[test]
    fn a_missing_packet_is_an_error() {
        let data = vec![0u8; 200];
        let packets = pack(1, CMD_CBOR, &data);
        let mut assembler = Assembler::new(1);
        assembler.push(&packets[0]).unwrap();
        assert!(assembler.push(&packets[2]).is_err());
    }
}
