//! Pedersen hash and commit tests
//!
//! Parallels barretenberg/ts/bb.js/src/barretenberg/pedersen.test.ts
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
