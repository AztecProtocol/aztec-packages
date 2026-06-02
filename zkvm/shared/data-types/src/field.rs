use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

/// Trait for a native field element. Each zkVM backend provides its own type.
pub trait Field:
    Copy + Eq + Ord + Default + core::fmt::Debug + Sized + Serialize + for<'de> Deserialize<'de>
{
    fn zero() -> Self;
    fn one() -> Self;
    fn from_le_bytes(bytes: &[u8]) -> Self;
    fn to_le_bytes(&self) -> Vec<u8>;
    fn is_zero(&self) -> bool;
}

/// Trait for a hash digest with ~128-bit collision resistance.
///
/// On BN254 backends (Jolt): wraps a single 254-bit Fr element.
/// On small-field backends (SP1/Stwo): wraps 8 field elements (~248 bits).
///
/// The kernel logic works entirely with `Digest` values and never sees the
/// internal representation.
pub trait Digest:
    Copy + Eq + Ord + Default + core::fmt::Debug + core::hash::Hash + Sized + Serialize + for<'de> Deserialize<'de>
{
    fn zero() -> Self;
    fn is_zero(&self) -> bool;
    fn to_bytes32(&self) -> [u8; 32];
    fn from_bytes32(bytes: &[u8; 32]) -> Self;
}

// -- Concrete implementations for testing (NativeField / NativeDigest) --

/// A 32-byte opaque field element for native (non-proven) execution.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash, Serialize, Deserialize)]
pub struct NativeDigest(pub [u8; 32]);

impl core::fmt::Debug for NativeDigest {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "Digest(0x")?;
        for b in &self.0[..4] {
            write!(f, "{:02x}", b)?;
        }
        write!(f, "...)")
    }
}

impl Digest for NativeDigest {
    fn zero() -> Self {
        Self([0u8; 32])
    }

    fn is_zero(&self) -> bool {
        self.0 == [0u8; 32]
    }

    fn to_bytes32(&self) -> [u8; 32] {
        self.0
    }

    fn from_bytes32(bytes: &[u8; 32]) -> Self {
        Self(*bytes)
    }
}

impl NativeDigest {
    pub fn from_u64(v: u64) -> Self {
        let mut bytes = [0u8; 32];
        bytes[..8].copy_from_slice(&v.to_le_bytes());
        Self(bytes)
    }
}
