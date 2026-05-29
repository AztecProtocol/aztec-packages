//! Pedersen hash tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs pedersen_tests.rs

#[cfg(test)]
use barretenberg_rs::{BbApi, FfiBackend, Fr};

#[test]
fn test_pedersen_hash_basic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(1), Fr::from_u64(2)];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Should not be zero
    assert_ne!(response.hash, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(42), Fr::from_u64(123)];

    let response1 = api
        .pedersen_hash(inputs.clone(), 0)
        .expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Same inputs should produce same output
    assert_eq!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs1 = vec![Fr::from_u64(1), Fr::from_u64(2)];
    let inputs2 = vec![Fr::from_u64(3), Fr::from_u64(4)];

    let response1 = api.pedersen_hash(inputs1, 0).expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs2, 0).expect("PedersenHash failed");

    // Different inputs should produce different outputs
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_single_input() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(42)];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_ne!(response.hash, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_zero_input() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(0)];

    let response = api
        .pedersen_hash(inputs.clone(), 0)
        .expect("PedersenHash failed");

    // Even zero input should produce non-zero output
    assert_ne!(response.hash, Fr::from_be_bytes([0u8; 32]));
    assert_ne!(response.hash, inputs[0]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_many_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs: Vec<Fr> = (0..10).map(Fr::from_u64).collect();

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_ne!(response.hash, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_hash_indices() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(1), Fr::from_u64(2)];

    let response1 = api
        .pedersen_hash(inputs.clone(), 0)
        .expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs, 1).expect("PedersenHash failed");

    // Different hash indices should produce different outputs
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_basic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(1), Fr::from_u64(2)];

    let response = api
        .pedersen_commit(inputs, 0)
        .expect("PedersenCommit failed");

    // Should not be the point at infinity
    assert_ne!(response.point.x, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![Fr::from_u64(42), Fr::from_u64(123)];

    let response1 = api
        .pedersen_commit(inputs.clone(), 0)
        .expect("PedersenCommit failed");
    let response2 = api
        .pedersen_commit(inputs, 0)
        .expect("PedersenCommit failed");

    // Same inputs should produce same commitment
    assert_eq!(response1.point.x, response2.point.x);
    assert_eq!(response1.point.y, response2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_different_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs1 = vec![Fr::from_u64(1), Fr::from_u64(2)];
    let inputs2 = vec![Fr::from_u64(3), Fr::from_u64(4)];

    let response1 = api
        .pedersen_commit(inputs1, 0)
        .expect("PedersenCommit failed");
    let response2 = api
        .pedersen_commit(inputs2, 0)
        .expect("PedersenCommit failed");

    // Different inputs should produce different commitments
    assert!(response1.point.x != response2.point.x || response1.point.y != response2.point.y);

    api.destroy().expect("Failed to destroy backend");
}
