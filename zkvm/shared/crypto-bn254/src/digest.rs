/// BN254 field element as a Digest type.
///
/// Wraps `ark_bn254::Fr` and implements the `zkvm_data_types::field::Digest` trait.
/// This is the natural digest type for BN254-native backends (Jolt) and
/// the protocol-compatible choice for testing.
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField, Zero};
use serde::{Deserialize, Serialize};

use zkvm_data_types::field::Digest;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Bn254Digest(#[serde(with = "fr_serde")] pub Fr);

impl Default for Bn254Digest {
    fn default() -> Self {
        Self(Fr::zero())
    }
}

impl core::fmt::Debug for Bn254Digest {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let bytes = self.to_bytes32();
        write!(f, "Bn254(0x")?;
        for b in &bytes[..4] {
            write!(f, "{:02x}", b)?;
        }
        write!(f, "...)")
    }
}

impl Digest for Bn254Digest {
    fn zero() -> Self {
        Self(Fr::zero())
    }

    fn is_zero(&self) -> bool {
        self.0.is_zero()
    }

    fn to_bytes32(&self) -> [u8; 32] {
        let bigint = self.0.into_bigint();
        let le_bytes = bigint.to_bytes_le();
        let mut be_bytes = [0u8; 32];
        for (i, b) in le_bytes.iter().enumerate() {
            if i < 32 {
                be_bytes[31 - i] = *b;
            }
        }
        be_bytes
    }

    fn from_bytes32(bytes: &[u8; 32]) -> Self {
        Self(Fr::from_be_bytes_mod_order(bytes))
    }
}

impl Bn254Digest {
    pub fn from_u64(v: u64) -> Self {
        Self(Fr::from(v))
    }

    pub fn inner(&self) -> Fr {
        self.0
    }
}

/// Serde helper for ark_bn254::Fr (serialize as big-endian 32 bytes).
mod fr_serde {
    use ark_bn254::Fr;
    use ark_ff::{BigInteger, PrimeField};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(fr: &Fr, serializer: S) -> Result<S::Ok, S::Error> {
        let bigint = fr.into_bigint();
        let le_bytes = bigint.to_bytes_le();
        let mut be_bytes = [0u8; 32];
        for (i, b) in le_bytes.iter().enumerate() {
            if i < 32 {
                be_bytes[31 - i] = *b;
            }
        }
        serializer.serialize_bytes(&be_bytes)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Fr, D::Error> {
        let bytes: &[u8] = Deserialize::deserialize(deserializer)?;
        if bytes.len() != 32 {
            return Err(serde::de::Error::custom("expected 32 bytes"));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        Ok(Fr::from_be_bytes_mod_order(&arr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_roundtrip() {
        let d = Bn254Digest::from_u64(12345);
        let bytes = d.to_bytes32();
        let d2 = Bn254Digest::from_bytes32(&bytes);
        assert_eq!(d, d2);
    }

    #[test]
    fn digest_zero() {
        let z = Bn254Digest::zero();
        assert!(z.is_zero());
        assert!(!Bn254Digest::from_u64(1).is_zero());
    }

    #[test]
    fn digest_ordering() {
        let a = Bn254Digest::from_u64(1);
        let b = Bn254Digest::from_u64(2);
        assert!(a < b);
    }
}
