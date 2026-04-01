//! Pedersen hash and commit tests

#[cfg(test)]
use crate::utils::{fr_from_u64, random_fr, Timer};
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_pedersen_hash() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let inputs = vec![fr_from_u64(4), fr_from_u64(8)];
    let response = api.pedersen_hash(inputs, 7).expect("PedersenHash failed");
    println!("Pedersen hash result: {:?}", hex::encode(&response.hash.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_hash_buffer() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let mut input = vec![0u8; 123];
    input[0..4].copy_from_slice(&321u32.to_be_bytes());
    input[119..123].copy_from_slice(&456u32.to_be_bytes());

    let response = api.pedersen_hash_buffer(input.as_slice(), 0).expect("PedersenHashBuffer failed");
    println!("Pedersen hash buffer result: {:?}", hex::encode(&response.hash.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pedersen_commit() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let inputs = vec![fr_from_u64(4), fr_from_u64(8), fr_from_u64(12)];
    let response = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");
    println!("Pedersen commit point.x: {:?}", hex::encode(&response.point.x.0));
    println!("Pedersen commit point.y: {:?}", hex::encode(&response.point.y.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore]
fn test_pedersen_hash_perf() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let loops = 1000;
    let fields: Vec<_> = (0..loops * 2).map(|_| random_fr()).collect();

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![fields[i * 2].clone(), fields[i * 2 + 1].clone()];
        let _ = api.pedersen_hash(inputs, 0).expect("PedersenHash failed");
    }
    let us = timer.us() / loops as u128;
    println!("Executed {} hashes at an average {}us / hash", loops, us);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
#[ignore]
fn test_pedersen_commit_perf() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let loops = 1000;
    let fields: Vec<_> = (0..loops * 2).map(|_| random_fr()).collect();

    let timer = Timer::new();
    for i in 0..loops {
        let inputs = vec![fields[i * 2].clone(), fields[i * 2 + 1].clone()];
        let _ = api.pedersen_commit(inputs, 0).expect("PedersenCommit failed");
    }
    let us = timer.us() / loops as u128;
    println!("Executed {} commits at an average {}us / commit", loops, us);

    api.destroy().expect("Failed to destroy backend");
}
