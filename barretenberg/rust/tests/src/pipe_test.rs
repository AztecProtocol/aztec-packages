//! UDS backend tests

#[cfg(test)]
use barretenberg_rs::{Fr, GrumpkinPoint};
#[cfg(test)]
use crate::utils::fr_from_u64;
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_uds_blake2s() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let input = b"abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    let expected: [u8; 32] = [
        0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a,
        0xda, 0x3d, 0x1c, 0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e,
        0x12, 0x43,
    ];

    let response = api.blake2s(input).expect("Blake2s failed");
    assert_eq!(response.hash.as_slice(), &expected, "Blake2s hash mismatch");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_uds_pedersen_hash() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let inputs = vec![fr_from_u64(4), fr_from_u64(8)];
    let response = api.pedersen_hash(inputs, 7).expect("PedersenHash failed");
    println!("Pedersen hash result (UDS): {:?}", hex::encode(&response.hash.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_uds_poseidon2_hash() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let inputs = vec![fr_from_u64(4), fr_from_u64(8)];
    let response = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    println!("Poseidon2 hash result (UDS): {:?}", hex::encode(&response.hash.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_uds_grumpkin_add() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let generator_x: [u8; 32] = [
        0x2d, 0xf8, 0xb9, 0x40, 0xe5, 0x89, 0x0e, 0x4e,
        0x13, 0x77, 0xe0, 0x53, 0x73, 0xfa, 0xe6, 0x9a,
        0x1d, 0x75, 0x4f, 0x69, 0x35, 0xe6, 0xa7, 0x80,
        0xb6, 0x66, 0x94, 0x74, 0x31, 0xf2, 0xcd, 0xcd,
    ];
    let generator_y: [u8; 32] = [
        0x2e, 0xcd, 0x88, 0xd1, 0x59, 0x67, 0xbc, 0x53,
        0xb8, 0x85, 0x91, 0x2e, 0x0d, 0x16, 0x86, 0x61,
        0x54, 0xac, 0xb6, 0xaa, 0xc2, 0xd3, 0xf8, 0x5e,
        0x27, 0xca, 0x7e, 0xef, 0xb2, 0xc1, 0x90, 0x83,
    ];

    let point_a = GrumpkinPoint { x: Fr(generator_x), y: Fr(generator_y) };
    let point_b = point_a.clone();

    let response = api.grumpkin_add(point_a, point_b).expect("GrumpkinAdd failed");
    println!("GrumpkinAdd result: x={}, y={}",
             hex::encode(&response.point.x.0),
             hex::encode(&response.point.y.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_uds_error_response() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let mut invalid_bytes = [0u8; 32];
    invalid_bytes[31] = 1;

    let invalid_point = GrumpkinPoint { x: Fr(invalid_bytes), y: Fr(invalid_bytes) };

    let result = api.grumpkin_add(invalid_point.clone(), invalid_point);

    match result {
        Ok(_) => println!("Note: Backend did not validate point on curve"),
        Err(e) => {
            println!("Got expected error for off-curve point: {:?}", e);
            assert!(
                format!("{:?}", e).contains("Backend") || format!("{:?}", e).contains("error"),
                "Expected a backend error, got: {:?}", e
            );
        }
    }

    api.destroy().expect("Failed to destroy backend");
}
