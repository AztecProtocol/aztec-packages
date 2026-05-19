//! Schnorr signature tests using FfiBackend
//!
//! Tests for Schnorr signatures over the Grumpkin curve.

#[cfg(test)]
use barretenberg_rs::{backends::FfiBackend, BarretenbergApi};

#[test]
fn test_schnorr_compute_public_key() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // A valid private key (32 bytes)
    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    let response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Should return a valid public key point
    assert_eq!(response.public_key.x.len(), 32);
    assert_eq!(response.public_key.y.len(), 32);
    // Should not be zero
    assert_ne!(response.public_key.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_compute_public_key_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key: [u8; 32] = [
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
        0xde, 0xf0,
    ];

    let response1 = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");
    let response2 = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Same private key should produce same public key
    assert_eq!(response1.public_key.x, response2.public_key.x);
    assert_eq!(response1.public_key.y, response2.public_key.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_different_private_keys() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

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
        .schnorr_compute_public_key(&private_key1)
        .expect("schnorr_compute_public_key failed");
    let response2 = api
        .schnorr_compute_public_key(&private_key2)
        .expect("schnorr_compute_public_key failed");

    // Different private keys should produce different public keys
    assert!(
        response1.public_key.x != response2.public_key.x
            || response1.public_key.y != response2.public_key.y
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_sign_and_verify() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Private key
    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    // Compute public key
    let pub_key_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Message: a 32-byte big-endian serialized grumpkin base-field element (bbapi asserts size == 32).
    let message: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x02, 0xbc,
    ];

    // Sign
    let sign_response = api
        .schnorr_construct_signature(&message, &private_key)
        .expect("schnorr_construct_signature failed");

    // Signature should have s and e components (32 bytes each)
    assert_eq!(sign_response.s.len(), 32);
    assert_eq!(sign_response.e.len(), 32);

    // Verify
    let verify_response = api
        .schnorr_verify_signature(
            &message,
            pub_key_response.public_key.clone(),
            &sign_response.s,
            &sign_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify_response.verified, "Signature should be valid");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_verify_wrong_message() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];

    let pub_key_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Two distinct 32-byte serialized field elements (bbapi asserts size == 32).
    let message1: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x11,
    ];
    let message2: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x22,
    ];

    // Sign with message1
    let sign_response = api
        .schnorr_construct_signature(&message1, &private_key)
        .expect("schnorr_construct_signature failed");

    // Verify with message2 - should fail
    let verify_response = api
        .schnorr_verify_signature(
            &message2,
            pub_key_response.public_key.clone(),
            &sign_response.s,
            &sign_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(
        !verify_response.verified,
        "Signature should be invalid for wrong message"
    );

    api.destroy().expect("Failed to destroy backend");
}

// Note: test_schnorr_sign_deterministic removed because Barretenberg's Schnorr
// implementation uses random nonces, making signatures non-deterministic.
// This is a valid security choice; both signatures verify correctly.
