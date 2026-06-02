use alloc::vec::Vec;
use crate::field::Digest;

/// Cryptographic primitives for the Aztec private execution environment.
///
/// Each zkVM backend provides its own implementation. The trait is designed so:
///
/// 1. **Test workloads are generic over `P: Precompiles`** — same contract code
///    works with any backend's crypto.
/// 2. **Multiple impls per backend** — e.g., SP1 can offer Poseidon2 (software)
///    vs SHA-256 (precompile) to benchmark different hash strategies.
/// 3. **Encryption toggleable** — constrained (computed in VM) vs unconstrained
///    (ciphertext provided as hint, not proven).
///
/// ## Implementations
///
/// - `NativePrecompiles` (this file): XOR stubs. For data-flow testing only.
/// - `Bn254Precompiles` (crypto-bn254 crate): real BN254 Poseidon2, stubbed EC.
/// - `JoltPrecompiles` (jolt guest): real Poseidon2 via Jolt's ark fork.
/// - `Sp1Bn254Precompiles` (sp1 guest): Poseidon2 via BN254 Fp syscalls.
///
/// ## Key findings (2026-04-11)
///
/// No zkVM has a guest-callable Poseidon2 precompile over BN254 Fr.
/// SP1 has BN254 Fp add/mul syscalls (7-9x cycle reduction for Poseidon2).
/// Jolt has zero precompiles (BN254-native only helps the prover).
/// See PLAN.md "Precompile and Gadget Comparison" for full matrix.
pub trait Precompiles {
    type Digest: Digest;

    // ---- Hashing ----

    fn poseidon2_hash(inputs: &[Self::Digest]) -> Self::Digest;
    fn poseidon2_hash_with_separator(inputs: &[Self::Digest], separator: u32) -> Self::Digest;
    fn poseidon2_compress(left: &Self::Digest, right: &Self::Digest) -> Self::Digest;
    fn sha256(data: &[u8]) -> [u8; 32];

    // ---- Elliptic curve (Grumpkin / secp256k1 / Ed25519 — backend chooses) ----

    fn ec_fixed_base_mul(scalar_bytes: &[u8; 32]) -> (Self::Digest, Self::Digest);
    fn ec_mul(point_x: &Self::Digest, point_y: &Self::Digest, scalar_bytes: &[u8; 32])
        -> (Self::Digest, Self::Digest);

    // ---- Signatures ----

    fn verify_signature(
        pubkey_x: &Self::Digest,
        pubkey_y: &Self::Digest,
        sig: &[u8; 64],
        msg: &[u8],
    ) -> bool;

    // ---- Encryption ----

    fn aes128_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8>;
    fn encryption_mode() -> EncryptionMode { EncryptionMode::Constrained }

    // ---- Configuration ----

    fn name() -> &'static str;
}

/// Whether encryption is proven (inside VM) or hinted (host provides ciphertext).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum EncryptionMode {
    Constrained,
    Unconstrained,
}

// -- Stub NativePrecompiles for compile-time compatibility --
// Real implementation is in zkvm-crypto-bn254::native_precompiles.

use crate::field::NativeDigest;

/// Stub precompiles using XOR hashing. Only for data-flow testing.
/// For real benchmarks, use `zkvm_crypto_bn254::Bn254Precompiles`.
pub struct NativePrecompiles;

impl Precompiles for NativePrecompiles {
    type Digest = NativeDigest;

    fn poseidon2_hash(inputs: &[NativeDigest]) -> NativeDigest {
        let mut out = [0u8; 32];
        for input in inputs {
            for (i, b) in input.0.iter().enumerate() {
                out[i] ^= b;
            }
        }
        NativeDigest(out)
    }

    fn poseidon2_hash_with_separator(inputs: &[NativeDigest], separator: u32) -> NativeDigest {
        let sep_digest = {
            let mut bytes = [0u8; 32];
            bytes[..4].copy_from_slice(&separator.to_le_bytes());
            NativeDigest(bytes)
        };
        let mut all = Vec::with_capacity(inputs.len() + 1);
        all.push(sep_digest);
        all.extend_from_slice(inputs);
        Self::poseidon2_hash(&all)
    }

    fn poseidon2_compress(left: &NativeDigest, right: &NativeDigest) -> NativeDigest {
        Self::poseidon2_hash(&[*left, *right])
    }

    fn sha256(_data: &[u8]) -> [u8; 32] { [0u8; 32] }

    fn ec_fixed_base_mul(_scalar_bytes: &[u8; 32]) -> (NativeDigest, NativeDigest) {
        (NativeDigest::zero(), NativeDigest::zero())
    }

    fn ec_mul(_px: &NativeDigest, _py: &NativeDigest, _s: &[u8; 32])
        -> (NativeDigest, NativeDigest)
    {
        (NativeDigest::zero(), NativeDigest::zero())
    }

    fn verify_signature(_pkx: &NativeDigest, _pky: &NativeDigest, _sig: &[u8; 64], _msg: &[u8]) -> bool {
        true
    }

    fn aes128_encrypt(_plaintext: &[u8], _key: &[u8; 16], _iv: &[u8; 16]) -> Vec<u8> {
        Vec::new()
    }

    fn name() -> &'static str { "native-stub" }
}
