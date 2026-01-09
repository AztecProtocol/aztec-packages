//! Pedersen hash and commit tests
//!
//! Parallels barretenberg/ts/src/barretenberg/pedersen.test.ts
//! Also includes tests ported from zkpassport/aztec-packages bb_rs pedersen_tests.rs
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi, Fr};
#[cfg(test)]
use crate::utils::{get_bb_binary_path, random_fr, Timer};
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_pedersen_hash() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(4).to_buffer().try_into().unwrap(),
        Fr::from_u64(8).to_buffer().try_into().unwrap(),
    ];

    let response = api.pedersen_hash(inputs, 7).expect("PedersenHash failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Pedersen hash result: {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_buffer() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let mut input = vec![0u8; 123];
    input[0..4].copy_from_slice(&321u32.to_be_bytes());
    input[119..123].copy_from_slice(&456u32.to_be_bytes());

    let response = api
        .pedersen_hash_buffer(input.as_slice(), 0)
        .expect("PedersenHashBuffer failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Pedersen hash buffer result: {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(4).to_buffer().try_into().unwrap(),
        Fr::from_u64(8).to_buffer().try_into().unwrap(),
        Fr::from_u64(12).to_buffer().try_into().unwrap(),
    ];

    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    let x = Fr::from_buffer_reduce(&response.point.x);
    let y = Fr::from_buffer_reduce(&response.point.y);

    // Print result for snapshot comparison
    println!("Pedersen commit point.x: {:?}", hex::encode(&x.0));
    println!("Pedersen commit point.y: {:?}", hex::encode(&y.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore] // Performance test - run with --ignored
fn test_pedersen_hash_perf() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let loops = 1000;
    let mut fields = Vec::with_capacity(loops * 2);
    for _ in 0..loops * 2 {
        fields.push(random_fr());
    }

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![
            fields[i * 2].to_buffer().try_into().unwrap(),
            fields[i * 2 + 1].to_buffer().try_into().unwrap(),
        ];
        let _ = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");
    }
    let us = timer.us() / loops as u128;

    println!("Executed {} hashes at an average {}us / hash", loops, us);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore] // Performance test - run with --ignored
fn test_pedersen_commit_perf() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let loops = 1000;
    let mut fields = Vec::with_capacity(loops * 2);
    for _ in 0..loops * 2 {
        fields.push(random_fr());
    }

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![
            fields[i * 2].to_buffer().try_into().unwrap(),
            fields[i * 2 + 1].to_buffer().try_into().unwrap(),
        ];
        let _ = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");
    }
    let us = timer.us() / loops as u128;

    println!("Executed {} commits at an average {}us / commit", loops, us);

    api.destroy().expect("Failed to destroy backend");
}

// JavaScript/WASM compatibility tests
// These tests verify that the Rust implementation produces identical results to the JS/WASM version

#[test]
fn test_pedersen_commit_js_compatibility() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: pedersenCommit([toBufferBE(1n, 32), toBufferBE(1n, 32)])
    let mut input1 = [0u8; 32];
    let mut input2 = [0u8; 32];
    input1[31] = 1; // big-endian 1n
    input2[31] = 1;
    let inputs = vec![input1.to_vec(), input2.to_vec()];

    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    // Expected from JS test
    let expected_x: [u8; 32] = [
        0x2f, 0x7a, 0x8f, 0x9a, 0x6c, 0x96, 0x92, 0x66, 0x82, 0x20, 0x5f, 0xb7, 0x3e, 0xe4, 0x32,
        0x15, 0xbf, 0x13, 0x52, 0x3c, 0x19, 0xd7, 0xaf, 0xe3, 0x6f, 0x12, 0x76, 0x02, 0x66, 0xcd,
        0xfe, 0x15,
    ];
    let expected_y: [u8; 32] = [
        0x01, 0x91, 0x6b, 0x31, 0x6a, 0xdb, 0xbf, 0x0e, 0x10, 0xe3, 0x9b, 0x18, 0xc1, 0xd2, 0x4b,
        0x33, 0xec, 0x84, 0xb4, 0x6d, 0xad, 0xdf, 0x72, 0xf4, 0x38, 0x78, 0xbc, 0xc9, 0x2b, 0x60,
        0x57, 0xe6,
    ];

    assert_eq!(response.point.x.as_slice(), &expected_x);
    assert_eq!(response.point.y.as_slice(), &expected_y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_with_zero_js_compatibility() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: pedersenCommit([toBufferBE(0n, 32), toBufferBE(1n, 32)])
    let input1 = [0u8; 32]; // 0n
    let mut input2 = [0u8; 32];
    input2[31] = 1; // 1n
    let inputs = vec![input1.to_vec(), input2.to_vec()];

    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");

    // Expected from JS test
    let expected_x: [u8; 32] = [
        0x05, 0x4a, 0xa8, 0x6a, 0x73, 0xcb, 0x8a, 0x34, 0x52, 0x5e, 0x5b, 0xbe, 0xd6, 0xe4, 0x3b,
        0xa1, 0x19, 0x8e, 0x86, 0x0f, 0x5f, 0x39, 0x50, 0x26, 0x8f, 0x71, 0xdf, 0x45, 0x91, 0xbd,
        0xe4, 0x02,
    ];
    let expected_y: [u8; 32] = [
        0x20, 0x9d, 0xcf, 0xbf, 0x2c, 0xfb, 0x57, 0xf9, 0xf6, 0x04, 0x6f, 0x44, 0xd7, 0x1a, 0xc6,
        0xfa, 0xf8, 0x72, 0x54, 0xaf, 0xc7, 0x40, 0x7c, 0x04, 0xeb, 0x62, 0x1a, 0x62, 0x87, 0xca,
        0xc1, 0x26,
    ];

    assert_eq!(response.point.x.as_slice(), &expected_x);
    assert_eq!(response.point.y.as_slice(), &expected_y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_js_compatibility() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: pedersenHash([toBufferBE(1n, 32), toBufferBE(1n, 32)])
    let mut input1 = [0u8; 32];
    let mut input2 = [0u8; 32];
    input1[31] = 1;
    input2[31] = 1;
    let inputs = vec![input1.to_vec(), input2.to_vec()];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Expected: '0x07ebfbf4df29888c6cd6dca13d4bb9d1a923013ddbbcbdc3378ab8845463297b'
    let expected: [u8; 32] = [
        0x07, 0xeb, 0xfb, 0xf4, 0xdf, 0x29, 0x88, 0x8c, 0x6c, 0xd6, 0xdc, 0xa1, 0x3d, 0x4b, 0xb9,
        0xd1, 0xa9, 0x23, 0x01, 0x3d, 0xdb, 0xbc, 0xbd, 0xc3, 0x37, 0x8a, 0xb8, 0x84, 0x54, 0x63,
        0x29, 0x7b,
    ];

    assert_eq!(response.hash.as_slice(), &expected);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_with_index_js_compatibility() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: pedersenHash([toBufferBE(1n, 32), toBufferBE(1n, 32)], 5)
    let mut input1 = [0u8; 32];
    let mut input2 = [0u8; 32];
    input1[31] = 1;
    input2[31] = 1;
    let inputs = vec![input1.to_vec(), input2.to_vec()];

    let response = api.pedersen_hash(inputs, 5).expect("PedersenHash failed");

    // Expected: '0x1c446df60816b897cda124524e6b03f36df0cec333fad87617aab70d7861daa6'
    let expected: [u8; 32] = [
        0x1c, 0x44, 0x6d, 0xf6, 0x08, 0x16, 0xb8, 0x97, 0xcd, 0xa1, 0x24, 0x52, 0x4e, 0x6b, 0x03,
        0xf3, 0x6d, 0xf0, 0xce, 0xc3, 0x33, 0xfa, 0xd8, 0x76, 0x17, 0xaa, 0xb7, 0x0d, 0x78, 0x61,
        0xda, 0xa6,
    ];

    assert_eq!(response.hash.as_slice(), &expected);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_deterministic() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let input = vec![42u8; 32];
    let inputs = vec![input.clone()];

    let response1 = api
        .pedersen_hash(inputs.clone(), 0)
        .expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Same input should produce same hash
    assert_eq!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_different_inputs() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs1 = vec![vec![1u8; 32]];
    let inputs2 = vec![vec![2u8; 32]];

    let response1 = api.pedersen_hash(inputs1, 0).expect("PedersenHash failed");
    let response2 = api.pedersen_hash(inputs2, 0).expect("PedersenHash failed");

    // Different inputs should produce different hashes
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_different_inputs() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs1 = vec![vec![1u8; 32], vec![2u8; 32]];
    let inputs2 = vec![vec![3u8; 32], vec![4u8; 32]];

    let response1 = api
        .pedersen_commit(inputs1, 0)
        .expect("PedersenCommit failed");
    let response2 = api
        .pedersen_commit(inputs2, 0)
        .expect("PedersenCommit failed");

    // Different inputs should produce different commitments
    assert_ne!(response1.point.x, response2.point.x);
    assert_ne!(response1.point.y, response2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_different_hash_index() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![vec![1u8; 32], vec![2u8; 32]];

    let response1 = api
        .pedersen_commit(inputs.clone(), 0)
        .expect("PedersenCommit failed");
    let response2 = api
        .pedersen_commit(inputs, 1)
        .expect("PedersenCommit failed");

    // Different hash indices should produce different commitments
    assert_ne!(response1.point.x, response2.point.x);
    assert_ne!(response1.point.y, response2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_buffer_different_data() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let buffer1 = vec![1u8, 2u8, 3u8];
    let buffer2 = vec![4u8, 5u8, 6u8];

    let response1 = api
        .pedersen_hash_buffer(&buffer1, 0)
        .expect("PedersenHashBuffer failed");
    let response2 = api
        .pedersen_hash_buffer(&buffer2, 0)
        .expect("PedersenHashBuffer failed");

    // Different buffers should produce different hashes
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_buffer_empty() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let buffer: Vec<u8> = vec![];

    // Note: Empty buffer may fail on the C++ backend - it expects at least some data
    let result = api.pedersen_hash_buffer(&buffer, 0);

    // The backend may reject empty input, which is acceptable behavior
    match result {
        Ok(response) => {
            // If it succeeds, verify it's a valid hash
            assert_ne!(response.hash, vec![0u8; 32]);
        }
        Err(_) => {
            // Empty buffer rejection is expected behavior for some backends
        }
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit_single_input() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![vec![42u8; 32]];

    let response = api
        .pedersen_commit(inputs, 0)
        .expect("PedersenCommit failed");

    // Single input should produce valid commitment
    assert_ne!(response.point.x, vec![0u8; 32]);
    assert_ne!(response.point.y, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_multiple_inputs() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        vec![1u8; 32],
        vec![2u8; 32],
        vec![3u8; 32],
        vec![4u8; 32],
    ];

    let response = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");

    // Multiple inputs should produce valid hash
    assert_ne!(response.hash, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}
