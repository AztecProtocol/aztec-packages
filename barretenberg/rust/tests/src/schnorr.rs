//! Schnorr signature tests
//!
//! Ported from zkpassport/aztec-packages bb_rs schnorr_tests.rs
//! These tests verify the Schnorr signature API compatibility.
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi};
#[cfg(test)]
use crate::require_bb_binary;
#[cfg(test)]
use crate::utils::get_bb_binary_path;

#[test]
fn test_schnorr_key_generation() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Should generate a valid point (non-zero x coordinate)
    assert_ne!(response.public_key.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_sign_verify() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let message = b"Hello, Schnorr!";

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");
    let public_key = pub_response.public_key;

    let sig_response = api
        .schnorr_construct_signature(message, &private_key)
        .expect("schnorr_construct_signature failed");

    let verify_response = api
        .schnorr_verify_signature(
            message,
            public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify_response.verified, "Signature should be valid");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_different_private_keys() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key1 = [1u8; 32];
    let private_key2 = [2u8; 32];

    let pub_response1 = api
        .schnorr_compute_public_key(&private_key1)
        .expect("schnorr_compute_public_key failed");
    let pub_response2 = api
        .schnorr_compute_public_key(&private_key2)
        .expect("schnorr_compute_public_key failed");

    // Different private keys should produce different public keys
    assert_ne!(pub_response1.public_key.x, pub_response2.public_key.x);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_different_messages() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [3u8; 32];
    let message1 = b"Message 1";
    let message2 = b"Message 2";

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    let sig_response1 = api
        .schnorr_construct_signature(message1, &private_key)
        .expect("schnorr_construct_signature failed");
    let sig_response2 = api
        .schnorr_construct_signature(message2, &private_key)
        .expect("schnorr_construct_signature failed");

    // Different messages should produce different signatures
    assert_ne!(sig_response1.s, sig_response2.s);
    assert_ne!(sig_response1.e, sig_response2.e);

    // Both should verify correctly
    let verify1 = api
        .schnorr_verify_signature(
            message1,
            pub_response.public_key.clone(),
            &sig_response1.s,
            &sig_response1.e,
        )
        .expect("schnorr_verify_signature failed");
    let verify2 = api
        .schnorr_verify_signature(
            message2,
            pub_response.public_key,
            &sig_response2.s,
            &sig_response2.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify1.verified);
    assert!(verify2.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_invalid_signature() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [4u8; 32];
    let message = b"Test message";
    let wrong_message = b"Wrong message";

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    let sig_response = api
        .schnorr_construct_signature(message, &private_key)
        .expect("schnorr_construct_signature failed");

    // Correct message should verify
    let verify_correct = api
        .schnorr_verify_signature(
            message,
            pub_response.public_key.clone(),
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");
    assert!(verify_correct.verified);

    // Wrong message should NOT verify
    let verify_wrong = api
        .schnorr_verify_signature(
            wrong_message,
            pub_response.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");
    assert!(!verify_wrong.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_wrong_public_key() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key1 = [7u8; 32];
    let private_key2 = [8u8; 32];
    let message = b"Test message";

    let pub_response1 = api
        .schnorr_compute_public_key(&private_key1)
        .expect("schnorr_compute_public_key failed");
    let pub_response2 = api
        .schnorr_compute_public_key(&private_key2)
        .expect("schnorr_compute_public_key failed");

    let sig_response = api
        .schnorr_construct_signature(message, &private_key1)
        .expect("schnorr_construct_signature failed");

    // Correct public key should verify
    let verify_correct = api
        .schnorr_verify_signature(
            message,
            pub_response1.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");
    assert!(verify_correct.verified);

    // Wrong public key should NOT verify
    let verify_wrong = api
        .schnorr_verify_signature(
            message,
            pub_response2.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");
    assert!(!verify_wrong.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_with_max_private_key() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [0xffu8; 32];
    let message = b"Max private key Schnorr test";

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    let sig_response = api
        .schnorr_construct_signature(message, &private_key)
        .expect("schnorr_construct_signature failed");

    let verify_response = api
        .schnorr_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_empty_message() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [10u8; 32];
    let empty_message = b"";

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    let sig_response = api
        .schnorr_construct_signature(empty_message, &private_key)
        .expect("schnorr_construct_signature failed");

    let verify_response = api
        .schnorr_verify_signature(
            empty_message,
            pub_response.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_long_message() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [11u8; 32];
    let long_message = vec![0x42u8; 1000]; // 1KB message

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    let sig_response = api
        .schnorr_construct_signature(&long_message, &private_key)
        .expect("schnorr_construct_signature failed");

    let verify_response = api
        .schnorr_verify_signature(
            &long_message,
            pub_response.public_key,
            &sig_response.s,
            &sig_response.e,
        )
        .expect("schnorr_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_signature_components_not_zero() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [13u8; 32];
    let message = b"Non-zero components test";

    let sig_response = api
        .schnorr_construct_signature(message, &private_key)
        .expect("schnorr_construct_signature failed");

    // Signature components should not be zero
    assert_ne!(sig_response.s, vec![0u8; 32]);
    assert_ne!(sig_response.e, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_schnorr_public_key_not_zero() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [14u8; 32];

    let pub_response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key failed");

    // Public key coordinates should not be zero
    assert_ne!(pub_response.public_key.x, vec![0u8; 32]);
    assert_ne!(pub_response.public_key.y, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}
