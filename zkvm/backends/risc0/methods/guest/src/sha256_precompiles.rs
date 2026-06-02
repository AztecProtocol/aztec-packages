/// Precompiles implementation using SHA-256 for all hashing.
///
/// RISC Zero has native circuit-level SHA-256 acceleration — SHA-256 compress
/// operations execute in very few cycles via a dedicated syscall. The patched
/// `sha2` crate (via workspace [patch]) routes through this automatically.
///
/// Same pattern as SP1's SHA-256 mode: all Poseidon2 trait methods are
/// implemented via SHA-256 instead. Different outputs from real Poseidon2
/// but exercises the same data flow through kernel logic.
///
/// Crypto operations:
///   - ec_fixed_base_mul / ec_mul: secp256k1 via k256 (real EC scalar-mul)
///   - verify_signature: ECDSA secp256k1 sign+verify round-trip (RFC6979 deterministic)
///     so EC math and SHA-256 precompile are always exercised
///   - aes128_encrypt: SHA-256 CTR-mode keystream XOR (uses HW SHA-256)
///
/// Note on verify_signature: the fixture pubkeys/signatures are Schnorr on Grumpkin
/// (incompatible with ECDSA secp256k1). We ignore the fixture inputs and always
/// run a sign+verify round-trip against a fixed scalar so the EC math is exercised.

extern crate alloc;
use alloc::vec::Vec;

use sha2::{Sha256, Digest as Sha2Digest};

use zkvm_data_types::field::{Digest, NativeDigest};
use zkvm_data_types::precompiles::Precompiles;

pub struct Risc0Sha256Precompiles;

#[inline]
fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

impl Precompiles for Risc0Sha256Precompiles {
    type Digest = NativeDigest;

    fn poseidon2_hash(inputs: &[NativeDigest]) -> NativeDigest {
        let mut data = Vec::with_capacity(inputs.len() * 32);
        for input in inputs {
            data.extend_from_slice(&input.to_bytes32());
        }
        NativeDigest(sha256_bytes(&data))
    }

    fn poseidon2_hash_with_separator(inputs: &[NativeDigest], separator: u32) -> NativeDigest {
        let mut data = Vec::with_capacity(4 + inputs.len() * 32);
        data.extend_from_slice(&separator.to_le_bytes());
        for input in inputs {
            data.extend_from_slice(&input.to_bytes32());
        }
        NativeDigest(sha256_bytes(&data))
    }

    fn poseidon2_compress(left: &NativeDigest, right: &NativeDigest) -> NativeDigest {
        let mut data = [0u8; 64];
        data[..32].copy_from_slice(&left.to_bytes32());
        data[32..].copy_from_slice(&right.to_bytes32());
        NativeDigest(sha256_bytes(&data))
    }

    fn sha256(data: &[u8]) -> [u8; 32] {
        sha256_bytes(data)
    }

    fn ec_fixed_base_mul(scalar_bytes: &[u8; 32]) -> (NativeDigest, NativeDigest) {
        let (x, y) = secp256k1_fixed_base_mul(scalar_bytes);
        (NativeDigest(x), NativeDigest(y))
    }

    fn ec_mul(
        point_x: &NativeDigest,
        point_y: &NativeDigest,
        scalar_bytes: &[u8; 32],
    ) -> (NativeDigest, NativeDigest) {
        let x_arr = point_x.to_bytes32();
        let y_arr = point_y.to_bytes32();
        let (rx, ry) = secp256k1_ec_mul(&x_arr, &y_arr, scalar_bytes);
        (NativeDigest(rx), NativeDigest(ry))
    }

    fn verify_signature(
        _pubkey_x: &NativeDigest,
        _pubkey_y: &NativeDigest,
        _sig: &[u8; 64],
        _msg: &[u8],
    ) -> bool {
        // The fixture signatures use Schnorr on Grumpkin — incompatible with secp256k1 ECDSA.
        // We run a real ECDSA sign+verify round-trip against a fixed scalar so the EC math
        // and SHA-256 precompile are always exercised.
        secp256k1_ecdsa_sign_and_verify()
    }

    fn aes128_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
        sha256_ctr_encrypt(plaintext, key, iv)
    }

    fn name() -> &'static str {
        "risc0-sha256-precompile"
    }
}

// ---- secp256k1 EC operations via k256 ----

/// Scalar multiply the secp256k1 generator: scalar_bytes (big-endian 32) * G.
/// Returns (x_be, y_be) as 32-byte arrays, or ([0;32], [0;32]) if scalar is zero/invalid.
fn secp256k1_fixed_base_mul(scalar_bytes: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    use k256::{ecdsa::SigningKey, FieldBytes};

    // Use SigningKey::from_bytes to validate the scalar — it rejects zero and values >= order.
    let fb = FieldBytes::clone_from_slice(scalar_bytes);
    let signing_key = match SigningKey::from_bytes(&fb) {
        Ok(k) => k,
        // scalar = 0 or >= group order: return identity (represented as zero bytes)
        Err(_) => return ([0u8; 32], [0u8; 32]),
    };

    let affine = signing_key.verifying_key().as_affine();
    extract_affine_coords(affine)
}

/// Multiply an arbitrary secp256k1 point by a scalar.
fn secp256k1_ec_mul(
    point_x: &[u8; 32],
    point_y: &[u8; 32],
    scalar_bytes: &[u8; 32],
) -> ([u8; 32], [u8; 32]) {
    use k256::elliptic_curve::sec1::FromEncodedPoint;
    use k256::{AffinePoint, EncodedPoint, FieldBytes, ProjectivePoint};

    // Parse scalar via SigningKey (validates non-zero + in-range)
    let scalar_fb = FieldBytes::clone_from_slice(scalar_bytes);
    let signing_key = match k256::ecdsa::SigningKey::from_bytes(&scalar_fb) {
        Ok(k) => k,
        Err(_) => return ([0u8; 32], [0u8; 32]),
    };

    // Parse the input point
    let x_fb = FieldBytes::clone_from_slice(point_x);
    let y_fb = FieldBytes::clone_from_slice(point_y);
    let encoded = EncodedPoint::from_affine_coordinates(&x_fb, &y_fb, false);
    let opt_pt: Option<AffinePoint> = AffinePoint::from_encoded_point(&encoded).into();
    let pt = match opt_pt {
        Some(p) => p,
        None => return ([0u8; 32], [0u8; 32]),
    };

    // Multiply: use NonZeroScalar directly with ProjectivePoint
    let result = ProjectivePoint::from(pt) * *signing_key.as_nonzero_scalar();
    extract_affine_coords(&result.to_affine())
}

/// Extract big-endian (x, y) bytes from a k256 AffinePoint.
#[inline]
fn extract_affine_coords(affine: &k256::AffinePoint) -> ([u8; 32], [u8; 32]) {
    use k256::elliptic_curve::point::AffineCoordinates;
    use k256::elliptic_curve::sec1::{Coordinates, ToEncodedPoint};

    let x_field_bytes = affine.x();
    let mut x_bytes = [0u8; 32];
    x_bytes.copy_from_slice(&x_field_bytes);
    let encoded = affine.to_encoded_point(false); // uncompressed: 0x04 || x || y
    let y_bytes: [u8; 32] = match encoded.coordinates() {
        Coordinates::Uncompressed { x: _, y } => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(y);
            arr
        }
        _ => return ([0u8; 32], [0u8; 32]),
    };

    (x_bytes, y_bytes)
}

// ---- ECDSA secp256k1 sign + verify via k256 ----
//
// RISC Zero's workspace [patch] replaces sha2 with a version that routes
// SHA-256 compress through a native syscall. k256's ECDSA signing and
// verification both call SHA-256 internally:
//   - sign: SHA-256 in RFC6979 nonce derivation
//   - verify: SHA-256 to hash the message before checking the signature
// Both paths exercise the HW precompile.

/// Run a deterministic ECDSA secp256k1 sign + verify round-trip.
///
/// Fixed private scalar = 42. RFC6979 ensures the signing is deterministic
/// (no RNG required) and the resulting signature is always valid.
/// Both sign() and verify() exercise SHA-256 (via RISC Zero's HW precompile)
/// and secp256k1 EC scalar multiplication.
fn secp256k1_ecdsa_sign_and_verify() -> bool {
    use k256::ecdsa::{signature::Signer, signature::Verifier, SigningKey, Signature};
    use k256::FieldBytes;

    // Fixed private key: scalar = 42
    let mut privkey_bytes = [0u8; 32];
    privkey_bytes[31] = 42;

    let fb = FieldBytes::clone_from_slice(&privkey_bytes);
    let signing_key = match SigningKey::from_bytes(&fb) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let verifying_key = signing_key.verifying_key();

    let msg = b"risc0 ecdsa bench";

    // RFC6979 deterministic signature — no RNG, always produces the same sig for same inputs
    let signature: Signature = signing_key.sign(msg);

    // Verify: SHA-256(msg) then EC check
    verifying_key.verify(msg, &signature).is_ok()
}

// ---- SHA-256 CTR-mode encryption ----
//
// Generates a keystream by hashing (key || iv || counter) with SHA-256 for each
// 32-byte block, then XORs with plaintext. This exercises the RISC Zero SHA-256
// native precompile for encryption-like workloads.
//
// One SHA-256 call per 32 plaintext bytes (ceiling division).

fn sha256_ctr_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
    let mut ciphertext = Vec::with_capacity(plaintext.len());
    let mut block_idx: u32 = 0;
    let mut offset = 0usize;

    while offset < plaintext.len() {
        // 16 (key) + 16 (iv) + 4 (counter) = 36 bytes per block input
        let mut block_input = [0u8; 36];
        block_input[..16].copy_from_slice(key);
        block_input[16..32].copy_from_slice(iv);
        block_input[32..36].copy_from_slice(&block_idx.to_le_bytes());
        let keystream = sha256_bytes(&block_input);

        let block_len = core::cmp::min(32, plaintext.len() - offset);
        for i in 0..block_len {
            ciphertext.push(plaintext[offset + i] ^ keystream[i]);
        }

        offset += block_len;
        block_idx = block_idx.wrapping_add(1);
    }

    ciphertext
}
