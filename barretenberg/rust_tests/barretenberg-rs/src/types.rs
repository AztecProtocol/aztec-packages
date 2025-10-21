//! Core types for Barretenberg operations

use serde::{Deserialize, Serialize};

/// Field element (Fr) - 254-bit field element for BN254
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fr(pub [u8; 32]);

impl Fr {
    /// Create a new field element from a u64 value
    pub fn from_u64(value: u64) -> Self {
        let mut bytes = [0u8; 32];
        bytes[0..8].copy_from_slice(&value.to_le_bytes());
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

    /// Create a random field element
    #[cfg(feature = "native")]
    pub fn random() -> Self {
        use std::time::SystemTime;
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        let mut bytes = [0u8; 32];
        bytes[0..16].copy_from_slice(&nanos.to_le_bytes());
        bytes[16..24].copy_from_slice(&(nanos >> 64).to_le_bytes()[0..8]);
        Fr(bytes)
    }
}

/// Point on the elliptic curve
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Point {
    #[serde(with = "serde_bytes")]
    pub x: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub y: Vec<u8>,
}

/// Blake2s hash command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake2sCommand {
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

/// Blake2s hash response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake2sResponse {
    #[serde(with = "serde_bytes")]
    pub hash: Vec<u8>,
}

/// Blake2s to field command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake2sToFieldCommand {
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

/// Blake2s to field response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake2sToFieldResponse {
    #[serde(with = "serde_bytes")]
    pub field: Vec<u8>,
}

/// Pedersen hash command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PedersenHashCommand {
    pub inputs: Vec<Vec<u8>>,
    pub hash_index: u32,
}

/// Pedersen hash response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PedersenHashResponse {
    #[serde(with = "serde_bytes")]
    pub hash: Vec<u8>,
}

/// Pedersen hash buffer command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PedersenHashBufferCommand {
    #[serde(with = "serde_bytes")]
    pub input: Vec<u8>,
    pub hash_index: u32,
}

/// Pedersen commit command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PedersenCommitCommand {
    pub inputs: Vec<Vec<u8>>,
    pub hash_index: u32,
}

/// Pedersen commit response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PedersenCommitResponse {
    pub point: Point,
}

/// Poseidon2 hash command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poseidon2HashCommand {
    pub inputs: Vec<Vec<u8>>,
}

/// Poseidon2 hash response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poseidon2HashResponse {
    #[serde(with = "serde_bytes")]
    pub hash: Vec<u8>,
}

/// Shutdown command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownCommand {}

/// Shutdown response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownResponse {}

/// Command enum wrapping all possible commands
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "0", content = "1")]
pub enum Command {
    Blake2s(Blake2sCommand),
    Blake2sToField(Blake2sToFieldCommand),
    PedersenHash(PedersenHashCommand),
    PedersenHashBuffer(PedersenHashBufferCommand),
    PedersenCommit(PedersenCommitCommand),
    Poseidon2Hash(Poseidon2HashCommand),
    Shutdown(ShutdownCommand),
}

/// Response enum wrapping all possible responses
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "0", content = "1")]
pub enum Response {
    Blake2s(Blake2sResponse),
    Blake2sToField(Blake2sToFieldResponse),
    PedersenHash(PedersenHashResponse),
    PedersenHashBuffer(PedersenHashResponse),
    PedersenCommit(PedersenCommitResponse),
    Poseidon2Hash(Poseidon2HashResponse),
    Shutdown(ShutdownResponse),
}

// Helper module for serde_bytes compatibility
mod serde_bytes {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bytes(bytes)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        <Vec<u8>>::deserialize(deserializer)
    }
}
