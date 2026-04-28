//! Core utility types for Barretenberg operations

use serde::{Deserialize, Serialize};

/// Field element (Fr) - 254-bit field element for BN254
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fr(pub [u8; 32]);

impl Fr {
    /// Create a new field element from a u64 value (big-endian encoding, matching C++ msgpack format)
    pub fn from_u64(value: u64) -> Self {
        let mut bytes = [0u8; 32];
        bytes[24..32].copy_from_slice(&value.to_be_bytes());
        Fr(bytes)
    }

    /// Create a field element from bytes (big-endian)
    pub fn from_be_bytes(bytes: [u8; 32]) -> Self {
        Fr(bytes)
    }

    /// Create a field element from bytes (little-endian)
    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        Fr(bytes)
    }

    /// Create a field element from a 32-byte buffer (no reduction)
    /// Panics if buffer is not exactly 32 bytes
    pub fn from_buffer(buffer: &[u8]) -> Self {
        let bytes: [u8; 32] = buffer.try_into().expect("Buffer must be exactly 32 bytes");
        Fr(bytes)
    }

    /// Create a field element from a byte slice, reducing if necessary
    pub fn from_buffer_reduce(buffer: &[u8]) -> Self {
        let mut bytes = [0u8; 32];
        let len = buffer.len().min(32);
        bytes[..len].copy_from_slice(&buffer[..len]);
        Fr(bytes)
    }

    /// Convert to a byte buffer (as used in msgpack)
    pub fn to_buffer(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

/// Point on the elliptic curve (affine_element)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Point {
    pub x: [u8; 32],
    pub y: [u8; 32],
}
