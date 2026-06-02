/// Nexus precompiles: real BN254 Poseidon2, stubbed EC ops.
/// EC ops stubbed because ark-grumpkin needs atomics (riscv32 has none).
use alloc::vec::Vec;
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField, Zero};

use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;

use super::poseidon2;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize)]
pub struct NexusBn254Digest(#[serde(with = "fr_serde")] pub Fr);

impl Default for NexusBn254Digest {
    fn default() -> Self { Self(Fr::zero()) }
}

impl core::fmt::Debug for NexusBn254Digest {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "NexusBn254(...)")
    }
}

impl Digest for NexusBn254Digest {
    fn zero() -> Self { Self(Fr::zero()) }
    fn is_zero(&self) -> bool { self.0.is_zero() }
    fn to_bytes32(&self) -> [u8; 32] {
        let le = self.0.into_bigint().to_bytes_le();
        let mut be = [0u8; 32];
        for (i, b) in le.iter().enumerate() { if i < 32 { be[31 - i] = *b; } }
        be
    }
    fn from_bytes32(bytes: &[u8; 32]) -> Self {
        Self(Fr::from_be_bytes_mod_order(bytes))
    }
}

pub struct NexusPoseidon2Precompiles;

impl Precompiles for NexusPoseidon2Precompiles {
    type Digest = NexusBn254Digest;

    fn poseidon2_hash(inputs: &[NexusBn254Digest]) -> NexusBn254Digest {
        let fr_inputs: Vec<Fr> = inputs.iter().map(|d| d.0).collect();
        NexusBn254Digest(poseidon2::hash(&fr_inputs))
    }

    fn poseidon2_hash_with_separator(inputs: &[NexusBn254Digest], separator: u32) -> NexusBn254Digest {
        let fr_inputs: Vec<Fr> = inputs.iter().map(|d| d.0).collect();
        NexusBn254Digest(poseidon2::hash_with_separator(&fr_inputs, separator))
    }

    fn poseidon2_compress(left: &NexusBn254Digest, right: &NexusBn254Digest) -> NexusBn254Digest {
        NexusBn254Digest(poseidon2::compress(&left.0, &right.0))
    }

    fn sha256(_data: &[u8]) -> [u8; 32] { [0u8; 32] }
    fn ec_fixed_base_mul(_s: &[u8; 32]) -> (NexusBn254Digest, NexusBn254Digest) { (NexusBn254Digest::zero(), NexusBn254Digest::zero()) }
    fn ec_mul(_px: &NexusBn254Digest, _py: &NexusBn254Digest, _s: &[u8; 32]) -> (NexusBn254Digest, NexusBn254Digest) { (NexusBn254Digest::zero(), NexusBn254Digest::zero()) }
    fn verify_signature(_pkx: &NexusBn254Digest, _pky: &NexusBn254Digest, _sig: &[u8; 64], _msg: &[u8]) -> bool { true }
    fn aes128_encrypt(_pt: &[u8], _key: &[u8; 16], _iv: &[u8; 16]) -> Vec<u8> { Vec::new() }
    fn name() -> &'static str { "nexus-poseidon2-bn254" }
}

mod fr_serde {
    use ark_bn254::Fr;
    use ark_ff::{BigInteger, PrimeField};
    use serde::{self, Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(fr: &Fr, s: S) -> Result<S::Ok, S::Error> {
        let le = fr.into_bigint().to_bytes_le();
        let mut be = [0u8; 32];
        for (i, b) in le.iter().enumerate() { if i < 32 { be[31 - i] = *b; } }
        s.serialize_bytes(&be)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Fr, D::Error> {
        let bytes: &[u8] = Deserialize::deserialize(d)?;
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        Ok(Fr::from_be_bytes_mod_order(&arr))
    }
}
