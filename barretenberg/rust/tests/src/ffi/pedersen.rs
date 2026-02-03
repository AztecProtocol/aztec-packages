//! Pedersen hash tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs pedersen_tests.rs

#[cfg(test)]
use barretenberg_rs::{backends::FfiBackend, BarretenbergApi, Fr};

#[test]
fn test_pedersen_hash_basic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test with simple inputs
    let inputs = vec![
        Fr::from_u64(1).to_buffer(),
        Fr::from_u64(2).to_buffer(),
    ];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Result should be a valid field element (32 bytes)
    assert_eq!(response.hash.len(), 32);
    // Should not be zero
    assert_ne!(response.hash, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(42).to_buffer(),
        Fr::from_u64(123).to_buffer(),
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
    let mut api = BarretenbergApi::new(backend);

    let inputs1 = vec![
        Fr::from_u64(1).to_buffer(),
        Fr::from_u64(2).to_buffer(),
    ];
    let inputs2 = vec![
        Fr::from_u64(3).to_buffer(),
        Fr::from_u64(4).to_buffer(),
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
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![Fr::from_u64(42).to_buffer()];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_eq!(response.hash.len(), 32);
    assert_ne!(response.hash, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_zero_input() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![Fr::from_u64(0).to_buffer()];

    let response = api.pedersen_hash(inputs.clone(), 0).expect("PedersenHash failed");

    // Even zero input should produce non-zero output
    assert_ne!(response.hash, vec![0u8; 32]);
    assert_ne!(response.hash, inputs[0]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_many_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test with many inputs
    let inputs: Vec<Vec<u8>> = (0..10).map(|i| Fr::from_u64(i).to_buffer()).collect();

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    assert_eq!(response.hash.len(), 32);
    assert_ne!(response.hash, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_hash_indices() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(1).to_buffer(),
        Fr::from_u64(2).to_buffer(),
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
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(1).to_buffer(),
        Fr::from_u64(2).to_buffer(),
    ];

    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    // Result should be a point (x, y coordinates)
    assert_eq!(response.point.x.len(), 32);
    assert_eq!(response.point.y.len(), 32);
    // Should not be the point at infinity
    assert_ne!(response.point.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(42).to_buffer(),
        Fr::from_u64(123).to_buffer(),
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
    let mut api = BarretenbergApi::new(backend);

    let inputs1 = vec![
        Fr::from_u64(1).to_buffer(),
        Fr::from_u64(2).to_buffer(),
    ];
    let inputs2 = vec![
        Fr::from_u64(3).to_buffer(),
        Fr::from_u64(4).to_buffer(),
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
