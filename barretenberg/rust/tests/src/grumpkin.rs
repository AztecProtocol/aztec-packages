//! Grumpkin curve tests
//!
//! Ported from zkpassport/aztec-packages bb_rs grumpkin_tests.rs
//! These tests verify the Grumpkin elliptic curve API compatibility.
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, generated_types::GrumpkinPoint, BarretenbergApi};
#[cfg(test)]
use crate::require_bb_binary;
#[cfg(test)]
use crate::utils::get_bb_binary_path;

// Grumpkin generator point (from precomputed_generators_grumpkin_impl.hpp)
// x = 0x2df8b940e5890e4e1377e05373fae69a1d754f6935e6a780b666947431f2cdcd
// y = 0x2ecd88d15967bc53b885912e0d16866154acb6aac2d3f85e27ca7eefb2c19083
#[cfg(test)]
fn grumpkin_generator() -> GrumpkinPoint {
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
    GrumpkinPoint {
        x: generator_x.to_vec(),
        y: generator_y.to_vec(),
    }
}

#[test]
fn test_grumpkin_scalar_multiplication() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let point = grumpkin_generator();
    let mut scalar = vec![0u8; 32];
    scalar[31] = 3; // scalar = 3

    let response = api
        .grumpkin_mul(point.clone(), &scalar)
        .expect("grumpkin_mul failed");

    // Result should be different from input
    assert_ne!(response.point.x, point.x);
    // Result should be a valid point (non-zero)
    assert_ne!(response.point.x, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_point_addition() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let point = grumpkin_generator();

    // Add generator to itself (should give 2*G)
    let response = api
        .grumpkin_add(point.clone(), point.clone())
        .expect("grumpkin_add failed");

    // Result should be different from input (it's 2*G, not G)
    assert_ne!(response.point.x, point.x);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_batch_multiplication() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let gen = grumpkin_generator();

    // Use the same generator point for batch mul (all are on curve)
    let points = vec![gen.clone(), gen.clone(), gen.clone()];

    let mut scalar = vec![0u8; 32];
    scalar[31] = 7; // scalar = 7

    let response = api
        .grumpkin_batch_mul(points.clone(), &scalar)
        .expect("grumpkin_batch_mul failed");

    // Should return same number of results as input points
    assert_eq!(response.points.len(), points.len());

    // Each result should be different from the corresponding input (multiplied by 7)
    for (i, result) in response.points.iter().enumerate() {
        assert_ne!(result.x, points[i].x);
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_random_scalar_generation() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let response1 = api
        .grumpkin_get_random_fr(0)
        .expect("grumpkin_get_random_fr failed");
    let response2 = api
        .grumpkin_get_random_fr(0)
        .expect("grumpkin_get_random_fr failed");

    // Random scalars should be different (very high probability)
    assert_ne!(response1.value, response2.value);
    // Should not be zero
    assert_ne!(response1.value, vec![0u8; 32]);
    assert_ne!(response2.value, vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_reduce512() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let large_input = [0xffu8; 64]; // Maximum 512-bit value

    let response = api
        .grumpkin_reduce512(&large_input)
        .expect("grumpkin_reduce512 failed");

    // Should produce a valid field element
    assert_ne!(response.value, vec![0u8; 32]);
    // Should be different from the first 32 bytes of input (since we're reducing)
    assert_ne!(response.value.as_slice(), &large_input[..32]);

    api.destroy().expect("Failed to destroy backend");
}

// JavaScript/WASM compatibility tests

#[test]
fn test_grumpkin_scalar_mul_deterministic() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let point = grumpkin_generator();

    // Test scalar
    let mut scalar = vec![0u8; 32];
    scalar[31] = 3;

    let result1 = api
        .grumpkin_mul(point.clone(), &scalar)
        .expect("grumpkin_mul failed");
    let result2 = api
        .grumpkin_mul(point, &scalar)
        .expect("grumpkin_mul failed");

    // Should be deterministic
    assert_eq!(result1.point.x, result2.point.x);
    assert_eq!(result1.point.y, result2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_batch_mul_vs_individual() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Use generator for all points
    let gen = grumpkin_generator();
    let test_points = vec![gen.clone(), gen.clone(), gen.clone()];

    // Test exponent
    let mut exponent = vec![0u8; 32];
    exponent[31] = 7;

    // Batch multiplication
    let batch_results = api
        .grumpkin_batch_mul(test_points.clone(), &exponent)
        .expect("grumpkin_batch_mul failed");

    // Individual multiplications
    let individual_results: Vec<_> = test_points
        .iter()
        .map(|point| {
            api.grumpkin_mul(point.clone(), &exponent)
                .expect("grumpkin_mul failed")
        })
        .collect();

    // Verify batch and individual results are identical
    assert_eq!(batch_results.points.len(), individual_results.len());
    for (batch_result, individual_result) in
        batch_results.points.iter().zip(individual_results.iter())
    {
        assert_eq!(batch_result.x, individual_result.point.x);
        assert_eq!(batch_result.y, individual_result.point.y);
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_point_addition_commutative() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let gen = grumpkin_generator();

    // Get 2*G by adding G to itself
    let two_g = api
        .grumpkin_add(gen.clone(), gen.clone())
        .expect("grumpkin_add failed");

    // Addition should be deterministic
    let result1 = api
        .grumpkin_add(gen.clone(), two_g.point.clone())
        .expect("grumpkin_add failed");
    let result2 = api
        .grumpkin_add(gen.clone(), two_g.point.clone())
        .expect("grumpkin_add failed");
    assert_eq!(result1.point.x, result2.point.x);
    assert_eq!(result1.point.y, result2.point.y);

    // Addition should be commutative
    let result3 = api
        .grumpkin_add(two_g.point, gen)
        .expect("grumpkin_add failed");
    assert_eq!(result1.point.x, result3.point.x);
    assert_eq!(result1.point.y, result3.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_scalar_reduction_deterministic() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let large_scalar_512 = [0xffu8; 64];

    let reduced1 = api
        .grumpkin_reduce512(&large_scalar_512)
        .expect("grumpkin_reduce512 failed");
    let reduced2 = api
        .grumpkin_reduce512(&large_scalar_512)
        .expect("grumpkin_reduce512 failed");

    // Reduction should be deterministic
    assert_eq!(reduced1.value, reduced2.value);

    // Reduced value should not be max value (modular reduction occurred)
    assert_ne!(reduced1.value.as_slice(), &[0xff; 32][..]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_random_scalar_uniqueness() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let mut scalars = Vec::new();

    // Generate several random scalars
    for _ in 0..5 {
        let response = api
            .grumpkin_get_random_fr(0)
            .expect("grumpkin_get_random_fr failed");
        scalars.push(response.value);
    }

    // All scalars should be non-zero
    for scalar in &scalars {
        assert_ne!(scalar.as_slice(), &[0u8; 32][..]);
    }

    // All scalars should be different from each other (extremely high probability)
    for i in 0..scalars.len() {
        for j in i + 1..scalars.len() {
            assert_ne!(scalars[i], scalars[j]);
        }
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_mul_by_one() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let point = grumpkin_generator();

    // Scalar = 1
    let mut scalar = vec![0u8; 32];
    scalar[31] = 1;

    let response = api
        .grumpkin_mul(point.clone(), &scalar)
        .expect("grumpkin_mul failed");

    // Multiplying by 1 should give the same point
    assert_eq!(response.point.x, point.x);
    assert_eq!(response.point.y, point.y);

    api.destroy().expect("Failed to destroy backend");
}
