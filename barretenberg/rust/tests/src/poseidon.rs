//! Poseidon2 hash tests
//!
//! Parallels barretenberg/ts/src/barretenberg/poseidon.test.ts
//! Also includes tests ported from zkpassport/aztec-packages bb_rs poseidon2_tests.rs
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi, Fr};
#[cfg(test)]
use crate::utils::{get_bb_binary_path, random_fr, Timer};
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_poseidon2_hash() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(4).to_buffer(),
        Fr::from_u64(8).to_buffer(),
    ];

    let response = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Poseidon2 hash result: {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_poseidon2_hash_deterministic() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let input = vec![42u8; 32];

    let response1 = api.poseidon2_hash(vec![input.clone()]).expect("Poseidon2Hash failed");
    let response2 = api.poseidon2_hash(vec![input]).expect("Poseidon2Hash failed");

    // Same input should produce same output
    assert_eq!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_poseidon2_hash_different_inputs() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let input1 = vec![1u8; 32];
    let input2 = vec![2u8; 32];

    let response1 = api.poseidon2_hash(vec![input1]).expect("Poseidon2Hash failed");
    let response2 = api.poseidon2_hash(vec![input2]).expect("Poseidon2Hash failed");

    // Different inputs should produce different outputs
    assert_ne!(response1.hash, response2.hash);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_poseidon2_hash_zero_input() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let input = vec![0u8; 32];

    let response = api.poseidon2_hash(vec![input.clone()]).expect("Poseidon2Hash failed");

    // Even zero input should produce non-zero output
    assert_ne!(response.hash, vec![0u8; 32]);
    assert_ne!(response.hash, input);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_poseidon2_permutation_js_compatibility_cpp() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: poseidon2Permutation([0, 1, 2, 3])
    // Expected results from the JS test
    let mut inputs = [vec![0u8; 32], vec![0u8; 32], vec![0u8; 32], vec![0u8; 32]];
    // inputs[0] stays 0
    inputs[1][31] = 1;
    inputs[2][31] = 2;
    inputs[3][31] = 3;

    let response = api.poseidon2_permutation(inputs).expect("Poseidon2Permutation failed");

    assert_eq!(response.outputs.len(), 4);

    // Expected results from the JS test
    let expected_0: [u8; 32] = [
        0x01, 0xbd, 0x53, 0x8c, 0x2e, 0xe0, 0x14, 0xed, 0x51, 0x41, 0xb2, 0x9e, 0x9a, 0xe2, 0x40,
        0xbf, 0x8d, 0xb3, 0xfe, 0x5b, 0x9a, 0x38, 0x62, 0x9a, 0x96, 0x47, 0xcf, 0x8d, 0x76, 0xc0,
        0x17, 0x37,
    ];
    let expected_1: [u8; 32] = [
        0x23, 0x9b, 0x62, 0xe7, 0xdb, 0x98, 0xaa, 0x3a, 0x2a, 0x8f, 0x6a, 0x0d, 0x2f, 0xa1, 0x70,
        0x9e, 0x7a, 0x35, 0x95, 0x9a, 0xa6, 0xc7, 0x03, 0x48, 0x14, 0xd9, 0xda, 0xa9, 0x0c, 0xba,
        0xc6, 0x62,
    ];
    let expected_2: [u8; 32] = [
        0x04, 0xcb, 0xb4, 0x4c, 0x61, 0xd9, 0x28, 0xed, 0x06, 0x80, 0x84, 0x56, 0xbf, 0x75, 0x8c,
        0xbf, 0x0c, 0x18, 0xd1, 0xe1, 0x5a, 0x7b, 0x6d, 0xbc, 0x82, 0x45, 0xfa, 0x75, 0x15, 0xd5,
        0xe3, 0xcb,
    ];
    let expected_3: [u8; 32] = [
        0x2e, 0x11, 0xc5, 0xcf, 0xf2, 0xa2, 0x2c, 0x64, 0xd0, 0x13, 0x04, 0xb7, 0x78, 0xd7, 0x8f,
        0x69, 0x98, 0xef, 0xf1, 0xab, 0x73, 0x16, 0x3a, 0x35, 0x60, 0x3f, 0x54, 0x79, 0x4c, 0x30,
        0x84, 0x7a,
    ];

    assert_eq!(response.outputs[0].as_slice(), &expected_0);
    assert_eq!(response.outputs[1].as_slice(), &expected_1);
    assert_eq!(response.outputs[2].as_slice(), &expected_2);
    assert_eq!(response.outputs[3].as_slice(), &expected_3);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_poseidon2_permutation_js_compatibility_noir() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // JS test: poseidon2Permutation([1n, 2n, 3n, 0x0a0000000000000000n])
    let mut inputs = [vec![0u8; 32], vec![0u8; 32], vec![0u8; 32], vec![0u8; 32]];

    // Set the values in big-endian
    inputs[0][31] = 1; // 1n
    inputs[1][31] = 2; // 2n
    inputs[2][31] = 3; // 3n
    // 0x0a0000000000000000n = 720575940379279360
    inputs[3][23] = 0x0a; // Set the appropriate byte for this large number

    let response = api.poseidon2_permutation(inputs).expect("Poseidon2Permutation failed");

    assert_eq!(response.outputs.len(), 4);

    // Expected results from the JS test
    let expected_0: [u8; 32] = [
        0x03, 0x69, 0x00, 0x7a, 0xa6, 0x30, 0xf5, 0xdf, 0xa3, 0x86, 0x64, 0x1b, 0x15, 0x41, 0x6e,
        0xcb, 0x16, 0xfb, 0x1a, 0x6f, 0x45, 0xb1, 0xac, 0xb9, 0x03, 0xcb, 0x98, 0x6b, 0x22, 0x1a,
        0x89, 0x1c,
    ];
    let expected_1: [u8; 32] = [
        0x19, 0x19, 0xfd, 0x47, 0x4b, 0x4e, 0x2e, 0x0f, 0x8e, 0x0c, 0xf8, 0xca, 0x98, 0xef, 0x28,
        0x56, 0x75, 0x78, 0x1c, 0xbd, 0x31, 0xaa, 0x48, 0x07, 0x43, 0x53, 0x85, 0xd2, 0x8e, 0x4c,
        0x02, 0xa5,
    ];
    let expected_2: [u8; 32] = [
        0x08, 0x10, 0xe7, 0xe9, 0xa1, 0xc2, 0x36, 0xaa, 0xe4, 0xeb, 0xff, 0x7d, 0x37, 0x51, 0xd9,
        0xf7, 0x34, 0x6d, 0xc4, 0x43, 0xd1, 0xde, 0x86, 0x39, 0x77, 0xd2, 0xb8, 0x1f, 0xe8, 0xc5,
        0x57, 0xf4,
    ];
    let expected_3: [u8; 32] = [
        0x1f, 0x4a, 0x18, 0x85, 0x75, 0xe2, 0x99, 0x85, 0xb6, 0xf8, 0xad, 0x03, 0xaf, 0xc1, 0xf0,
        0x75, 0x94, 0x88, 0xf8, 0x83, 0x5a, 0xaf, 0xb6, 0xe1, 0x9e, 0x06, 0x16, 0x0f, 0xb6, 0x4d,
        0x3d, 0x4a,
    ];

    assert_eq!(response.outputs[0].as_slice(), &expected_0);
    assert_eq!(response.outputs[1].as_slice(), &expected_1);
    assert_eq!(response.outputs[2].as_slice(), &expected_2);
    assert_eq!(response.outputs[3].as_slice(), &expected_3);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore] // Performance test - run with --ignored
fn test_poseidon2_hash_perf() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let loops = 1000;
    let mut fields = Vec::with_capacity(loops * 2);
    for _ in 0..loops * 2 {
        fields.push(random_fr().to_buffer());
    }

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![
            fields[i * 2].clone(),
            fields[i * 2 + 1].clone(),
        ];
        let _ = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    }
    let us = timer.us() / loops as u128;

    println!("Executed {} hashes at an average {}us / hash", loops, us);

    api.destroy().expect("Failed to destroy backend");
}
