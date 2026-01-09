//! ECDSA signature tests
//!
//! Ported from zkpassport/aztec-packages bb_rs ecdsa_tests.rs
//! These tests verify the ECDSA API compatibility for both secp256k1 and secp256r1 curves.
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi};
#[cfg(test)]
use crate::require_bb_binary;
#[cfg(test)]
use crate::utils::get_bb_binary_path;

// ECDSA secp256k1 tests

#[test]
fn test_ecdsa_secp256k1_key_generation() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    // Public key should not be zero (64 bytes total: 32 for x, 32 for y)
    assert_ne!(response.public_key.x, vec![0u8; 32]);
    assert_ne!(response.public_key.y, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256k1_sign_verify() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let message = b"Test message for ECDSA";

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(verify_response.verified, "Signature should be valid");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256k1_invalid_signature() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let message = b"Test message";
    let wrong_message = b"Wrong message";

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            wrong_message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(!verify_response.verified, "Signature should be invalid for wrong message");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256k1_public_key_recovery() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [3u8; 32];
    let message = b"Key recovery test";

    let _pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let recovered_response = api
        .ecdsa_secp256k1_recover_public_key(
            message,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_recover_public_key failed");

    // Recovered public key should not be zero
    assert_ne!(recovered_response.public_key.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

// ECDSA secp256r1 tests

#[test]
fn test_ecdsa_secp256r1_key_generation() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [1u8; 32];
    let response = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    assert_ne!(response.public_key.x, vec![0u8; 32]);
    assert_ne!(response.public_key.y, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256r1_sign_verify() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [2u8; 32];
    let message = b"Test message for ECDSA secp256r1";

    let pub_response = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256r1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256r1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256r1_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256r1_verify_signature failed");

    assert!(verify_response.verified, "Signature should be valid");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256r1_public_key_recovery() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [4u8; 32];
    let message = b"secp256r1 key recovery";

    let _pub_response = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256r1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256r1_construct_signature failed");

    let recovered_response = api
        .ecdsa_secp256r1_recover_public_key(
            message,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256r1_recover_public_key failed");

    assert_ne!(recovered_response.public_key.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

// Cross-curve comparison tests

#[test]
fn test_ecdsa_curves_different_public_keys() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [6u8; 32];

    let pub_k1 = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let pub_r1 = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    // Different curves should produce different public keys
    assert_ne!(pub_k1.public_key.x, pub_r1.public_key.x);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_curves_different_signatures() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [7u8; 32];
    let message = b"Same message, different curves";

    let sig_k1 = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");
    let sig_r1 = api
        .ecdsa_secp256r1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256r1_construct_signature failed");

    // Different curves should produce different signatures
    assert_ne!(sig_k1.r, sig_r1.r);
    assert_ne!(sig_k1.s, sig_r1.s);

    api.destroy().expect("Failed to destroy backend");
}

// Edge case tests

#[test]
fn test_ecdsa_with_max_private_key() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [0xffu8; 32];
    let message = b"Max private key test";

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_empty_message() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [8u8; 32];
    let empty_message = b"";

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(empty_message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            empty_message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_long_message() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [9u8; 32];
    let long_message = vec![0x42u8; 1000]; // 1KB message

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(&long_message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256k1_verify_signature(
            &long_message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");

    assert!(verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_wrong_public_key() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [11u8; 32];
    let wrong_private_key = [12u8; 32];
    let message = b"Wrong key test";

    let pub_response = api
        .ecdsa_secp256k1_compute_public_key(&private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");
    let wrong_pub_response = api
        .ecdsa_secp256k1_compute_public_key(&wrong_private_key)
        .expect("ecdsa_secp256k1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    // Correct verification should pass
    let verify_correct = api
        .ecdsa_secp256k1_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");
    assert!(verify_correct.verified);

    // Wrong public key should fail
    let verify_wrong = api
        .ecdsa_secp256k1_verify_signature(
            message,
            wrong_pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256k1_verify_signature failed");
    assert!(!verify_wrong.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_signature_components_not_zero() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [13u8; 32];
    let message = b"Non-zero components test";

    let sig_response = api
        .ecdsa_secp256k1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256k1_construct_signature failed");

    // Signature components should not be zero
    assert_ne!(sig_response.r, vec![0u8; 32]);
    assert_ne!(sig_response.s, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256r1_invalid_signature() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [17u8; 32];
    let message = b"Test message";
    let wrong_message = b"Wrong message";

    let pub_response = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256r1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256r1_construct_signature failed");

    let verify_response = api
        .ecdsa_secp256r1_verify_signature(
            wrong_message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256r1_verify_signature failed");

    assert!(!verify_response.verified);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_ecdsa_secp256r1_wrong_public_key() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let private_key = [18u8; 32];
    let wrong_private_key = [19u8; 32];
    let message = b"Wrong key test r1";

    let pub_response = api
        .ecdsa_secp256r1_compute_public_key(&private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");
    let wrong_pub_response = api
        .ecdsa_secp256r1_compute_public_key(&wrong_private_key)
        .expect("ecdsa_secp256r1_compute_public_key failed");

    let sig_response = api
        .ecdsa_secp256r1_construct_signature(message, &private_key)
        .expect("ecdsa_secp256r1_construct_signature failed");

    // Correct verification should pass
    let verify_correct = api
        .ecdsa_secp256r1_verify_signature(
            message,
            pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256r1_verify_signature failed");
    assert!(verify_correct.verified);

    // Wrong public key should fail
    let verify_wrong = api
        .ecdsa_secp256r1_verify_signature(
            message,
            wrong_pub_response.public_key,
            &sig_response.r,
            &sig_response.s,
            sig_response.v,
        )
        .expect("ecdsa_secp256r1_verify_signature failed");
    assert!(!verify_wrong.verified);

    api.destroy().expect("Failed to destroy backend");
}
