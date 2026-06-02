/// SP1 native Poseidon2 precompile — THE most efficient hash on SP1.
///
/// Uses syscall_poseidon2 which runs as a dedicated AIR circuit.
/// Width 16, rate 8, over KoalaBear (31-bit) field.
/// ONE syscall per permutation — no field arithmetic, no multi-step composition.
///
/// Compare: BN254 Fp precompile Poseidon2 = ~224 syscalls per hash
///          SHA-256 precompile = 2 syscalls per hash
///          Native Poseidon2 = 1 syscall per permutation
use alloc::vec::Vec;
use sp1_zkvm::lib::poseidon2::{Poseidon2ByteHash, RATE};
use zkvm_data_types::field::{Digest, NativeDigest};
use zkvm_data_types::precompiles::Precompiles;

pub struct Sp1NativePoseidon2Precompiles;

fn native_hash(inputs: &[&[u8]]) -> NativeDigest {
    let mut data = Vec::new();
    for input in inputs {
        data.extend_from_slice(input);
    }
    let output = Poseidon2ByteHash::hash(&data);
    // Pack 8 × u32 into 32 bytes (little-endian)
    let mut bytes = [0u8; 32];
    for (i, val) in output.iter().enumerate() {
        let offset = i * 4;
        if offset + 4 <= 32 {
            bytes[offset..offset + 4].copy_from_slice(&val.to_le_bytes());
        }
    }
    NativeDigest(bytes)
}

impl Precompiles for Sp1NativePoseidon2Precompiles {
    type Digest = NativeDigest;

    fn poseidon2_hash(inputs: &[NativeDigest]) -> NativeDigest {
        let byte_slices: Vec<&[u8]> = inputs.iter().map(|d| d.0.as_slice()).collect();
        native_hash(&byte_slices)
    }

    fn poseidon2_hash_with_separator(inputs: &[NativeDigest], separator: u32) -> NativeDigest {
        let sep_bytes = separator.to_le_bytes();
        let mut byte_slices: Vec<&[u8]> = Vec::with_capacity(inputs.len() + 1);
        byte_slices.push(&sep_bytes);
        for input in inputs {
            byte_slices.push(&input.0);
        }
        native_hash(&byte_slices)
    }

    fn poseidon2_compress(left: &NativeDigest, right: &NativeDigest) -> NativeDigest {
        native_hash(&[&left.0, &right.0])
    }

    fn sha256(_data: &[u8]) -> [u8; 32] { [0u8; 32] }
    fn ec_fixed_base_mul(_s: &[u8; 32]) -> (NativeDigest, NativeDigest) { (NativeDigest::zero(), NativeDigest::zero()) }
    fn ec_mul(_px: &NativeDigest, _py: &NativeDigest, _s: &[u8; 32]) -> (NativeDigest, NativeDigest) { (NativeDigest::zero(), NativeDigest::zero()) }
    fn verify_signature(_pkx: &NativeDigest, _pky: &NativeDigest, _sig: &[u8; 64], _msg: &[u8]) -> bool { true }
    fn aes128_encrypt(_pt: &[u8], _key: &[u8; 16], _iv: &[u8; 16]) -> Vec<u8> { Vec::new() }
    fn name() -> &'static str { "sp1-native-poseidon2" }
}
