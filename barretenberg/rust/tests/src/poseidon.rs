//! Poseidon2 hash tests
//!
//! Parallels barretenberg/ts/bb.js/src/barretenberg/poseidon.test.ts
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::Fr;
#[cfg(test)]
use crate::utils::spawn_bb;
#[cfg(test)]
use crate::utils::{get_bb_binary_path, random_fr, Timer};
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_poseidon2_hash() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let mut api = spawn_bb(&bb_path);

    let inputs = vec![
        Fr::from_u64(4),
        Fr::from_u64(8),
    ];

    let response = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Poseidon2 hash result: {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore] // Performance test - run with --ignored
fn test_poseidon2_hash_perf() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let mut api = spawn_bb(&bb_path);

    let loops = 1000;
    let mut fields = Vec::with_capacity(loops * 2);
    for _ in 0..loops * 2 {
        fields.push(random_fr());
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
