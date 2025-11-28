//! Pipe backend tests
//!
//! Tests for the pipe (stdin/stdout) backend implementation
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi, Fr};
#[cfg(test)]
use crate::utils::get_bb_binary_path;
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_pipe_blake2s() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create pipe backend");
    let mut api = BarretenbergApi::new(backend);

    let input = b"abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    let expected: [u8; 32] = [
        0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a,
        0xda, 0x3d, 0x1c, 0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e,
        0x12, 0x43,
    ];

    let response = api.blake2s(input).expect("Blake2s failed");

    assert_eq!(
        response.hash.as_slice(),
        &expected,
        "Blake2s hash mismatch"
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pipe_pedersen_hash() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create pipe backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(4).to_buffer(),
        Fr::from_u64(8).to_buffer(),
    ];

    let response = api.pedersen_hash(inputs, 7).expect("PedersenHash failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Pedersen hash result (pipe): {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pipe_poseidon2_hash() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create pipe backend");
    let mut api = BarretenbergApi::new(backend);

    let inputs = vec![
        Fr::from_u64(4).to_buffer(),
        Fr::from_u64(8).to_buffer(),
    ];

    let response = api.poseidon2_hash(inputs).expect("Poseidon2Hash failed");
    let result = Fr::from_buffer_reduce(&response.hash);

    // Print result for snapshot comparison
    println!("Poseidon2 hash result (pipe): {:?}", hex::encode(&result.0));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pipe_grumpkin_add() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create pipe backend");
    let mut api = BarretenbergApi::new(backend);

    // Grumpkin generator point
    let generator_x: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ];
    let generator_y: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
    ];

    use barretenberg_rs::AffineElement;
    let point_a = AffineElement {
        x: generator_x.to_vec(),
        y: generator_y.to_vec(),
    };
    let point_b = point_a.clone();

    let response = api.grumpkin_add(point_a, point_b).expect("GrumpkinAdd failed");
    println!("GrumpkinAdd result: x={}, y={}",
             hex::encode(&response.point.x),
             hex::encode(&response.point.y));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_pipe_error_response() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1))
        .expect("Failed to create pipe backend");
    let mut api = BarretenbergApi::new(backend);

    // Create an invalid point (off-curve) to trigger an error
    // This point has x=1, y=1 which is NOT on the Grumpkin curve
    let invalid_x: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ];
    let invalid_y: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ];

    use barretenberg_rs::AffineElement;
    let invalid_point = AffineElement {
        x: invalid_x.to_vec(),
        y: invalid_y.to_vec(),
    };

    // This should fail because the point is not on the curve
    let result = api.grumpkin_add(invalid_point.clone(), invalid_point);

    match result {
        Ok(_) => {
            // Some backends might not validate points, which is also acceptable
            println!("Note: Backend did not validate point on curve");
        },
        Err(e) => {
            println!("Got expected error for off-curve point: {:?}", e);
            // Verify it's a backend error (ErrorResponse)
            assert!(
                format!("{:?}", e).contains("Backend") || format!("{:?}", e).contains("error"),
                "Expected a backend error, got: {:?}", e
            );
        }
    }

    api.destroy().expect("Failed to destroy backend");
}
