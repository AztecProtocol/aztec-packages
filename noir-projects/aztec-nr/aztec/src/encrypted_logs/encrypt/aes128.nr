use std::hash::{from_field_unsafe as fr_to_fq_unsafe, sha256};

use dep::protocol_types::{
    constants::{GENERATOR_INDEX__SYMMETRIC_KEY, GENERATOR_INDEX__SYMMETRIC_KEY_2},
    hash::poseidon2_hash_with_separator,
    point::Point,
};

use crate::utils::point::point_to_bytes;

fn extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2(
    shared_secret: Point,
) -> [u8; 32] {
    let rand1: Field = poseidon2_hash_with_separator(
        [shared_secret.x, shared_secret.y],
        GENERATOR_INDEX__SYMMETRIC_KEY,
    );
    let rand2: Field = poseidon2_hash_with_separator(
        [shared_secret.x, shared_secret.y],
        GENERATOR_INDEX__SYMMETRIC_KEY_2,
    );
    let rand1_bytes: [u8; 16] = rand1.to_le_bytes();
    let rand2_bytes: [u8; 16] = rand2.to_le_bytes();
    let mut bytes: [u8; 32] = [0; 32];
    for i in 0..16 {
        bytes[i] = rand1_bytes[i];
        bytes[i + 1] = rand2_bytes[i];
    }
    bytes
}

fn extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_sha256(
    shared_secret: Point,
) -> [u8; 32] {
    let shared_secret_bytes: [u8; 32] = point_to_bytes(shared_secret);

    let mut shared_secret_bytes_with_separator: [u8; 33] = std::mem::zeroed();
    for i in 0..shared_secret_bytes.len() {
        shared_secret_bytes_with_separator[i] = shared_secret_bytes[i];
    }
    shared_secret_bytes_with_separator[32] = GENERATOR_INDEX__SYMMETRIC_KEY;

    sha256(shared_secret_bytes_with_separator)
}

fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret(
    shared_secret: Point,
    randomness_extraction_fn: fn(Point) -> [u8; 32],
) -> ([u8; 16], [u8; 16]) {
    let random_256_bits = randomness_extraction_fn(shared_secret);
    let mut sym_key = [0; 16];
    let mut iv = [0; 16];
    for i in 0..16 {
        sym_key[i] = random_256_bits[i];
        iv[i] = random_256_bits[i + 16];
    }
    (sym_key, iv)
}

pub fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
    shared_secret: Point,
) -> ([u8; 16], [u8; 16]) {
    derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret(
        shared_secret,
        extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_sha256,
    )
}

pub fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2(
    shared_secret: Point,
) -> ([u8; 16], [u8; 16]) {
    derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret(
        shared_secret,
        extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2,
    )
}
