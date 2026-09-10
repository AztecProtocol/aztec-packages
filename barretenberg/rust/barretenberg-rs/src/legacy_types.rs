//! Pre-codegen value types, kept so existing callers compile unchanged.
//!
//! Codegen models 32-byte scalars as `Bin32` and wire structs as holding it.
//! The types here keep the older `[u8; 32]` / `Vec<u8>` shapes and convert at
//! the API boundary in [`crate::legacy`]. New code should use the generated
//! types directly.

use crate::generated::bb_types as wire;

/// Deprecated: a 32-byte field element. Prefer the generated `Fr`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Fr(pub [u8; 32]);

impl Fr {
    /// Big-endian, matching the C++ msgpack representation.
    pub fn from_u64(value: u64) -> Self {
        let mut bytes = [0u8; 32];
        bytes[24..32].copy_from_slice(&value.to_be_bytes());
        Self(bytes)
    }

    pub fn from_be_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Panics if the buffer is not exactly 32 bytes long.
    pub fn from_buffer(buffer: &[u8]) -> Self {
        let bytes: [u8; 32] = buffer.try_into().expect("Buffer must be exactly 32 bytes");
        Self(bytes)
    }

    /// Truncates or zero-pads to 32 bytes.
    pub fn from_buffer_reduce(buffer: &[u8]) -> Self {
        let mut bytes = [0u8; 32];
        let len = buffer.len().min(32);
        bytes[..len].copy_from_slice(&buffer[..len]);
        Self(bytes)
    }

    pub fn to_buffer(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl From<Fr> for wire::Bin32 {
    fn from(value: Fr) -> Self {
        wire::Bin32(value.0)
    }
}

impl From<wire::Bin32> for Fr {
    fn from(value: wire::Bin32) -> Self {
        Self(value.0)
    }
}

/// Scalars arrive from callers as loose bytes; the wire type is fixed size.
fn to_bin32(bytes: &[u8]) -> wire::Bin32 {
    wire::Bin32(bytes.try_into().expect("expected a 32-byte scalar"))
}

macro_rules! legacy_point {
    ($name:ident, $wire:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, PartialEq, Eq, Default)]
        pub struct $name {
            pub x: Vec<u8>,
            pub y: Vec<u8>,
        }

        impl From<$name> for wire::$wire {
            fn from(value: $name) -> Self {
                wire::$wire {
                    x: to_bin32(&value.x),
                    y: to_bin32(&value.y),
                }
            }
        }

        impl From<wire::$wire> for $name {
            fn from(value: wire::$wire) -> Self {
                Self {
                    x: value.x.0.to_vec(),
                    y: value.y.0.to_vec(),
                }
            }
        }
    };
}

legacy_point!(GrumpkinPoint, GrumpkinPoint, "Deprecated: byte-valued Grumpkin point.");
legacy_point!(Bn254G1Point, Bn254G1Point, "Deprecated: byte-valued BN254 G1 point.");
legacy_point!(Secp256k1Point, Secp256k1Point, "Deprecated: byte-valued secp256k1 point.");
legacy_point!(Secp256r1Point, Secp256r1Point, "Deprecated: byte-valued secp256r1 point.");

/// Deprecated: byte-valued BN254 G2 point (coordinates are Fq pairs).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Bn254G2Point {
    pub x: [Vec<u8>; 2],
    pub y: [Vec<u8>; 2],
}

impl From<Bn254G2Point> for wire::Bn254G2Point {
    fn from(value: Bn254G2Point) -> Self {
        wire::Bn254G2Point {
            x: value.x.map(|c| to_bin32(&c)),
            y: value.y.map(|c| to_bin32(&c)),
        }
    }
}

/// Deprecated: byte-valued responses that carry a point, so callers can keep
/// destructuring `.x` / `.y` as `Vec<u8>`.
macro_rules! legacy_point_response {
    ($name:ident, $wire:ident, $field:ident, $point:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq)]
        pub struct $name {
            pub $field: $point,
        }

        impl From<wire::$wire> for $name {
            fn from(value: wire::$wire) -> Self {
                Self {
                    $field: value.$field.into(),
                }
            }
        }
    };
}

legacy_point_response!(
    EcdsaSecp256k1ComputePublicKeyResponse,
    EcdsaSecp256k1ComputePublicKeyResponse,
    public_key,
    Secp256k1Point
);
legacy_point_response!(
    EcdsaSecp256r1ComputePublicKeyResponse,
    EcdsaSecp256r1ComputePublicKeyResponse,
    public_key,
    Secp256r1Point
);
legacy_point_response!(
    SchnorrComputePublicKeyResponse,
    SchnorrComputePublicKeyResponse,
    public_key,
    GrumpkinPoint
);
