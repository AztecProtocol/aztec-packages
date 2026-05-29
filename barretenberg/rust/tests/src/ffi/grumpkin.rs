//! Grumpkin curve tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs grumpkin_tests.rs

#[cfg(test)]
use barretenberg_rs::{generated_types::GrumpkinPoint, BbApi, FfiBackend, Fr};

// Grumpkin generator point
// x = 1
// y = sqrt(1^3 - 17) on the Grumpkin curve
#[cfg(test)]
fn grumpkin_generator() -> GrumpkinPoint {
    // The generator for Grumpkin
    // x = 0x0000000000000000000000000000000000000000000000000000000000000001
    // y = 0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c
    let x: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x01,
    ];
    let y: [u8; 32] = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d,
        0x63, 0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18, 0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f,
        0x27, 0x2c,
    ];
    GrumpkinPoint {
        x: x.into(),
        y: y.into(),
    }
}

#[test]
fn test_grumpkin_scalar_multiplication() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = grumpkin_generator();
    let scalar = Fr::from_u64(3);

    let response = api
        .grumpkin_mul(point.clone(), scalar)
        .expect("grumpkin_mul failed");

    // Result should be different from input (3*G != G)
    assert_ne!(response.point.x, point.x);
    // Result should be a valid point (non-zero)
    assert_ne!(response.point.x, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_scalar_multiplication_by_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = grumpkin_generator();
    let scalar = Fr::from_u64(1);

    let response = api
        .grumpkin_mul(point.clone(), scalar)
        .expect("grumpkin_mul failed");

    // Multiplying by 1 should give the same point
    assert_eq!(response.point.x, point.x);
    assert_eq!(response.point.y, point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_random_scalar_generation() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response1 = api
        .grumpkin_get_random_fr(0)
        .expect("grumpkin_get_random_fr failed");
    let response2 = api
        .grumpkin_get_random_fr(0)
        .expect("grumpkin_get_random_fr failed");

    // Random scalars should be different (very high probability)
    assert_ne!(response1.value, response2.value);
    // Should not be zero
    assert_ne!(response1.value, Fr::from_be_bytes([0u8; 32]));
    assert_ne!(response2.value, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_random_scalar_multiple_calls() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let mut scalars = Vec::new();
    for _ in 0..10 {
        let response = api
            .grumpkin_get_random_fr(0)
            .expect("grumpkin_get_random_fr failed");
        scalars.push(response.value);
    }

    // Check that all scalars are different
    for i in 0..scalars.len() {
        for j in (i + 1)..scalars.len() {
            assert_ne!(
                scalars[i], scalars[j],
                "Scalars at index {} and {} should be different",
                i, j
            );
        }
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_reduce512() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let large_input = [0xffu8; 64]; // Maximum 512-bit value

    let response = api
        .grumpkin_reduce512(&large_input)
        .expect("grumpkin_reduce512 failed");

    // Should produce a valid field element
    assert_ne!(response.value, Fr::from_be_bytes([0u8; 32]));
    // Should be different from the first 32 bytes of input (since we're reducing)
    assert_ne!(response.value.as_slice(), &large_input[..32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_reduce512_small_value() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let mut small_input = [0u8; 64];
    small_input[63] = 42; // A small value

    let response = api
        .grumpkin_reduce512(&small_input)
        .expect("grumpkin_reduce512 failed");

    // For a small value, the reduction should preserve it
    let mut expected = [0u8; 32];
    expected[31] = 42;
    assert_eq!(response.value, Fr::from_be_bytes(expected));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_reduce512_zero() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let zero_input = [0u8; 64];

    let response = api
        .grumpkin_reduce512(&zero_input)
        .expect("grumpkin_reduce512 failed");

    // Zero should remain zero after reduction
    assert_eq!(response.value, Fr::from_be_bytes([0u8; 32]));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_mul_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = grumpkin_generator();
    let scalar = Fr::from_u64(5);

    let result1 = api
        .grumpkin_mul(point.clone(), scalar.clone())
        .expect("grumpkin_mul failed");
    let result2 = api
        .grumpkin_mul(point, scalar)
        .expect("grumpkin_mul failed");

    // Should be deterministic
    assert_eq!(result1.point.x, result2.point.x);
    assert_eq!(result1.point.y, result2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_grumpkin_reduce512_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let large_scalar_512 = [0xffu8; 64];

    let reduced1 = api
        .grumpkin_reduce512(&large_scalar_512)
        .expect("grumpkin_reduce512 failed");
    let reduced2 = api
        .grumpkin_reduce512(&large_scalar_512)
        .expect("grumpkin_reduce512 failed");

    // Reduction should be deterministic
    assert_eq!(reduced1.value, reduced2.value);

    api.destroy().expect("Failed to destroy backend");
}
