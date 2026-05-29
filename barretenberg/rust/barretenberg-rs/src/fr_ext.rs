//! Extra constructors / accessors on the generated `Fr` type that downstream
//! callers (tests, ports of TS helpers) already depend on. Kept as a separate
//! impl block here rather than inside `generated/bb_types.rs` so the generated
//! file stays a pure regen target.

use crate::generated::bb_types::{Bin32, Fr};

impl From<[u8; 32]> for Bin32 {
    fn from(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
}

impl From<Bin32> for [u8; 32] {
    fn from(value: Bin32) -> Self {
        value.0
    }
}

impl Fr {
    /// Create a field element from a u64 value (big-endian, matching the
    /// C++ msgpack representation).
    pub fn from_u64(value: u64) -> Self {
        let mut bytes = [0u8; 32];
        bytes[24..32].copy_from_slice(&value.to_be_bytes());
        Self(bytes)
    }

    /// Create a field element from 32 big-endian bytes.
    pub fn from_be_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Create a field element from 32 little-endian bytes.
    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Create a field element from a 32-byte buffer (no reduction).
    /// Panics if the buffer is not exactly 32 bytes long.
    pub fn from_buffer(buffer: &[u8]) -> Self {
        let bytes: [u8; 32] = buffer.try_into().expect("Buffer must be exactly 32 bytes");
        Self(bytes)
    }

    /// Create a field element from a byte slice, truncating or zero-padding
    /// to 32 bytes as needed.
    pub fn from_buffer_reduce(buffer: &[u8]) -> Self {
        let mut bytes = [0u8; 32];
        let len = buffer.len().min(32);
        bytes[..len].copy_from_slice(&buffer[..len]);
        Self(bytes)
    }

    /// Convert to a byte buffer (as used in msgpack).
    pub fn to_buffer(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}
