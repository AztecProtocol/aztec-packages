//! Poseidon2 hash tests

#[cfg(test)]
use crate::utils::{fr_from_u64, random_fr, Timer};
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_poseidon2_hash() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let inputs = vec![fr_from_u64(4), fr_from_u64(8)];
    let response = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    println!("Poseidon2 hash result: {:?}", hex::encode(&response.hash.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore]
fn test_poseidon2_hash_perf() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let loops = 1000;
    let mut fields: Vec<_> = (0..loops * 2).map(|_| random_fr()).collect();

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![fields[i * 2].clone(), fields[i * 2 + 1].clone()];
        let _ = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    }
    let us = timer.us() / loops as u128;
    println!("Executed {} hashes at an average {}us / hash", loops, us);

    api.destroy().expect("Failed to destroy backend");
}
