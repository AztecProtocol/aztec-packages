//! Pedersen hash tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs pedersen_tests.rs

#[cfg(test)]
use barretenberg_rs::{FfiBackend, BbApi, Fr};
#[cfg(test)]
use crate::utils::fr_from_u64;

#[test]
fn test_pedersen_hash_basic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    // Test with simple inputs
    let inputs = vec![
        fr_from_u64(1),
        fr_from_u64(2),
    ];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Result should be a valid field element (32 bytes)
    assert_eq!(response.hash.as_slice().len(), 32);
    // Should not be zero
    assert_ne!(response.hash, Fr([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![
        fr_from_u64(42),
        fr_from_u64(123),
    ];

    let response1 = api.pedersen_hash(inputs.clone(), 0).expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Same inputs should produce same output
    assert_eq!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs1 = vec![
        fr_from_u64(1),
        fr_from_u64(2),
    ];
    let inputs2 = vec![
        fr_from_u64(3),
        fr_from_u64(4),
    ];

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

    let inputs = vec![fr_from_u64(42)];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_eq!(response.hash.as_slice().len(), 32);
    assert_ne!(response.hash, Fr([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_zero_input() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![fr_from_u64(0)];

    let response = api.pedersen_hash(inputs.clone(), 0).expect("PedersenHash failed");

    // Even zero input should produce non-zero output
    assert_ne!(response.hash, Fr([0u8; 32]));
    assert_ne!(response.hash, inputs[0].clone());

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_many_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    // Test with many inputs
    let inputs: Vec<Fr> = (0..10).map(|i| fr_from_u64(i)).collect();

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_eq!(response.hash.as_slice().len(), 32);
    assert_ne!(response.hash, Fr([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_hash_indices() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![
        fr_from_u64(1),
        fr_from_u64(2),
    ];

    let response1 = api.pedersen_hash(inputs.clone(), 0).expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs, 1).expect("PedersenHash failed");

    // Different hash indices should produce different outputs
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_basic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![
        fr_from_u64(1),
        fr_from_u64(2),
    ];

    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    // Result should be a point (x, y coordinates)
    assert_eq!(response.point.x.as_slice().len(), 32);
    assert_eq!(response.point.y.as_slice().len(), 32);
    // Should not be the point at infinity
    assert_ne!(response.point.x, Fr([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs = vec![
        fr_from_u64(42),
        fr_from_u64(123),
    ];

    let response1 = api.pedersen_commit(inputs.clone(), 0).expect("PedersenCommit failed");
    let response2 = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    // Same inputs should produce same commitment
    assert_eq!(response1.point.x, response2.point.x);
    assert_eq!(response1.point.y, response2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_different_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let inputs1 = vec![
        fr_from_u64(1),
        fr_from_u64(2),
    ];
    let inputs2 = vec![
        fr_from_u64(3),
        fr_from_u64(4),
    ];

    let response1 = api.pedersen_commit(inputs1, 0).expect("PedersenCommit failed");
    let response2 = api.pedersen_commit(inputs2, 0).expect("PedersenCommit failed");

    // Different inputs should produce different commitments
    assert!(
        response1.point.x != response2.point.x
            || response1.point.y != response2.point.y
    );

    api.destroy().expect("Failed to destroy backend");
}
