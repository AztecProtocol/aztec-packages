//! ECDSA tests using FfiBackend
//!
//! Tests for ECDSA secp256k1 signatures.

#[cfg(test)]
use barretenberg_rs::{
    generated_types::{Secp256k1Fq, Secp256k1Point},
    BbApi, FfiBackend,
};

#[test]
fn test_ecdsa_compute_public_key() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    // A valid secp256k1 private key (32 bytes)
    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    let response = api
        .ecdsa_secp256k1_compute_public_key(private_key.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");

    // Should not be all zeros
    assert_ne!(response.public_key.x, Secp256k1Fq::from_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_compute_public_key_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let private_key: [u8; 32] = [
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
        0xde, 0xf0,
    ];

    let response1 = api
        .ecdsa_secp256k1_compute_public_key(private_key.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let response2 = api
        .ecdsa_secp256k1_compute_public_key(private_key.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");

    // Same private key should produce same public key
    assert_eq!(response1.public_key.x, response2.public_key.x);
    assert_eq!(response1.public_key.y, response2.public_key.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_different_private_keys() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let private_key1: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];
    let private_key2: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x02,
    ];

    let response1 = api
        .ecdsa_secp256k1_compute_public_key(private_key1.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let response2 = api
        .ecdsa_secp256k1_compute_public_key(private_key2.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");

    // Different private keys should produce different public keys
    assert!(
        response1.public_key.x != response2.public_key.x
            || response1.public_key.y != response2.public_key.y
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_sign_and_verify() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    // Private key
    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    // Compute public key
    let pub_key_response = api
        .ecdsa_secp256k1_compute_public_key(private_key.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let public_key = Secp256k1Point {
        x: pub_key_response.public_key.x.clone(),
        y: pub_key_response.public_key.y.clone(),
    };

    // Message hash (32 bytes)
    let message_hash: [u8; 32] = [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e,
        0x1f, 0x20,
    ];

    // Sign
    let sign_response = api
        .ecdsa_secp256k1_construct_signature(&message_hash, private_key.into())
        .expect("ecdsa_secp256k1_construct_signature failed");

    // Verify
    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            &message_hash,
            public_key,
            sign_response.r,
            sign_response.s,
            sign_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(verify_response.verified, "Signature should be valid");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_verify_wrong_message() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    let pub_key_response = api
        .ecdsa_secp256k1_compute_public_key(private_key.into())
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let public_key = Secp256k1Point {
        x: pub_key_response.public_key.x.clone(),
        y: pub_key_response.public_key.y.clone(),
    };

    let message_hash1: [u8; 32] = [0x01; 32];
    let message_hash2: [u8; 32] = [0x02; 32];

    // Sign with message_hash1
    let sign_response = api
        .ecdsa_secp256k1_construct_signature(&message_hash1, private_key.into())
        .expect("ecdsa_secp256k1_construct_signature failed");

    // Verify with message_hash2 - should fail
    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            &message_hash2,
            public_key,
            sign_response.r,
            sign_response.s,
            sign_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(
        !verify_response.verified,
        "Signature should be invalid for wrong message"
    );

    api.destroy().expect("Failed to destroy backend");
}
