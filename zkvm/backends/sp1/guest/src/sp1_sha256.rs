/// Precompiles implementation using SHA-256 for all hashing.
///
/// SP1 patches the `sha2` crate to route through its SHA-256 precompile
/// (syscall_sha256_extend + syscall_sha256_compress) when building for
/// the zkvm target. This means we get hardware-accelerated SHA-256 just
/// by using `sha2::Sha256`.
///
/// All Poseidon2 trait methods are implemented via SHA-256 instead:
/// - poseidon2_hash: SHA-256 of concatenated digest bytes
/// - poseidon2_hash_with_separator: SHA-256 with separator prefix
/// - poseidon2_compress: SHA-256 of left || right
///
/// This produces different outputs from real Poseidon2 but exercises the
/// same data flow through the kernel logic. Useful for benchmarking
/// hash-function cycle costs.

extern crate alloc;
use alloc::vec::Vec;

use sha2::{Sha256, Digest as Sha2Digest};

use zkvm_data_types::field::{Digest, NativeDigest};
use zkvm_data_types::precompiles::Precompiles;

/// SP1-accelerated Precompiles using SHA-256 precompile for all hashing.
pub struct Sp1Sha256Precompiles;

/// SHA-256 hash of arbitrary bytes, returning [u8; 32].
#[inline]
fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

impl Precompiles for Sp1Sha256Precompiles {
    type Digest = NativeDigest;

    fn poseidon2_hash(inputs: &[NativeDigest]) -> NativeDigest {
        // Concatenate all input digests and SHA-256 the result.
        let mut data = Vec::with_capacity(inputs.len() * 32);
        for input in inputs {
            data.extend_from_slice(&input.to_bytes32());
        }
        NativeDigest(sha256_bytes(&data))
    }

    fn poseidon2_hash_with_separator(inputs: &[NativeDigest], separator: u32) -> NativeDigest {
        // Prepend the separator as 4 LE bytes, then concatenate digests.
        let mut data = Vec::with_capacity(4 + inputs.len() * 32);
        data.extend_from_slice(&separator.to_le_bytes());
        for input in inputs {
            data.extend_from_slice(&input.to_bytes32());
        }
        NativeDigest(sha256_bytes(&data))
    }

    fn poseidon2_compress(left: &NativeDigest, right: &NativeDigest) -> NativeDigest {
        // Two-to-one compression: SHA-256(left || right)
        let mut data = [0u8; 64];
        data[..32].copy_from_slice(&left.to_bytes32());
        data[32..].copy_from_slice(&right.to_bytes32());
        NativeDigest(sha256_bytes(&data))
    }

    fn sha256(data: &[u8]) -> [u8; 32] {
        sha256_bytes(data)
    }

    fn ec_fixed_base_mul(_scalar_bytes: &[u8; 32]) -> (NativeDigest, NativeDigest) {
        (NativeDigest::zero(), NativeDigest::zero())
    }

    fn ec_mul(
        _point_x: &NativeDigest,
        _point_y: &NativeDigest,
        _scalar_bytes: &[u8; 32],
    ) -> (NativeDigest, NativeDigest) {
        (NativeDigest::zero(), NativeDigest::zero())
    }

    fn verify_signature(
        _pubkey_x: &NativeDigest,
        _pubkey_y: &NativeDigest,
        _sig: &[u8; 64],
        _msg: &[u8],
    ) -> bool {
        true
    }

    fn aes128_encrypt(_plaintext: &[u8], _key: &[u8; 16], _iv: &[u8; 16]) -> Vec<u8> {
        Vec::new()
    }

    fn name() -> &'static str {
        "sp1-sha256-precompile"
    }
}
