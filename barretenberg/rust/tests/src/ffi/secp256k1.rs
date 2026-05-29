//! secp256k1 curve tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs secp256k1_tests.rs

#[cfg(test)]
use barretenberg_rs::{
    generated_types::{Secp256k1Fq, Secp256k1Fr, Secp256k1Point},
    BbApi, FfiBackend,
};

#[cfg(test)]
fn zero_fq() -> Secp256k1Fq {
    Secp256k1Fq::from_bytes([0u8; 32])
}

#[cfg(test)]
fn zero_fr() -> Secp256k1Fr {
    Secp256k1Fr::from_bytes([0u8; 32])
}

#[cfg(test)]
fn fr_from_u32(value: u32) -> Secp256k1Fr {
    let mut bytes = [0u8; 32];
    bytes[28..32].copy_from_slice(&value.to_be_bytes());
    Secp256k1Fr::from_bytes(bytes)
}

// secp256k1 generator point G
// x = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
// y = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
#[cfg(test)]
fn secp256k1_generator() -> Secp256k1Point {
    let generator_x: [u8; 32] = [
        0x79, 0xbe, 0x66, 0x7e, 0xf9, 0xdc, 0xbb, 0xac, 0x55, 0xa0, 0x62, 0x95, 0xce, 0x87, 0x0b,
        0x07, 0x02, 0x9b, 0xfc, 0xdb, 0x2d, 0xce, 0x28, 0xd9, 0x59, 0xf2, 0x81, 0x5b, 0x16, 0xf8,
        0x17, 0x98,
    ];
    let generator_y: [u8; 32] = [
        0x48, 0x3a, 0xda, 0x77, 0x26, 0xa3, 0xc4, 0x65, 0x5d, 0xa4, 0xfb, 0xfc, 0x0e, 0x11, 0x08,
        0xa8, 0xfd, 0x17, 0xb4, 0x48, 0xa6, 0x85, 0x54, 0x19, 0x9c, 0x47, 0xd0, 0x8f, 0xfb, 0x10,
        0xd4, 0xb8,
    ];
    Secp256k1Point {
        x: generator_x.into(),
        y: generator_y.into(),
    }
}

#[test]
fn test_secp256k1_scalar_multiplication() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = secp256k1_generator();
    let scalar = fr_from_u32(3);

    let response = api
        .secp256k1_mul(point.clone(), scalar)
        .expect("secp256k1_mul failed");

    // Result should be different from input (3*G != G)
    assert_ne!(response.point.x, point.x);
    // Result should be a valid point (non-zero)
    assert_ne!(response.point.x, zero_fq());

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_scalar_multiplication_by_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = secp256k1_generator();
    let scalar = fr_from_u32(1);

    let response = api
        .secp256k1_mul(point.clone(), scalar)
        .expect("secp256k1_mul failed");

    // Multiplying by 1 should give the same point
    assert_eq!(response.point.x, point.x);
    assert_eq!(response.point.y, point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_random_scalar_generation() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response1 = api
        .secp256k1_get_random_fr(0)
        .expect("secp256k1_get_random_fr failed");
    let response2 = api
        .secp256k1_get_random_fr(0)
        .expect("secp256k1_get_random_fr failed");

    // Random scalars should be different (very high probability)
    assert_ne!(response1.value, response2.value);
    // Should not be zero
    assert_ne!(response1.value, zero_fr());
    assert_ne!(response2.value, zero_fr());

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_random_scalar_multiple_calls() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let mut scalars = Vec::new();
    for _ in 0..10 {
        let response = api
            .secp256k1_get_random_fr(0)
            .expect("secp256k1_get_random_fr failed");
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
fn test_secp256k1_reduce512() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let large_input = [0xffu8; 64]; // Maximum 512-bit value

    let response = api
        .secp256k1_reduce512(&large_input)
        .expect("secp256k1_reduce512 failed");

    // Should produce a valid field element
    assert_ne!(response.value, zero_fr());
    // Should be different from the first 32 bytes of input (since we're reducing)
    assert_ne!(response.value.as_slice(), &large_input[..32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_reduce512_small_value() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let mut small_input = [0u8; 64];
    small_input[63] = 42; // A small value

    let response = api
        .secp256k1_reduce512(&small_input)
        .expect("secp256k1_reduce512 failed");

    // For a small value, the reduction should preserve it
    let mut expected = [0u8; 32];
    expected[31] = 42;
    assert_eq!(response.value, Secp256k1Fr::from_bytes(expected));

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_reduce512_zero() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let zero_input = [0u8; 64];

    let response = api
        .secp256k1_reduce512(&zero_input)
        .expect("secp256k1_reduce512 failed");

    // Zero should remain zero after reduction
    assert_eq!(response.value, zero_fr());

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_reduce512_various_inputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    // Test with different patterns
    let mut input1 = [0u8; 64];
    input1[0] = 0xff;
    input1[32] = 0xff;
    let result1 = api
        .secp256k1_reduce512(&input1)
        .expect("secp256k1_reduce512 failed");

    let input2 = [0xaau8; 64];
    let result2 = api
        .secp256k1_reduce512(&input2)
        .expect("secp256k1_reduce512 failed");

    // Results should be different for different inputs
    assert_ne!(result1.value, result2.value);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_mul_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let point = secp256k1_generator();
    let scalar = fr_from_u32(5);

    let result1 = api
        .secp256k1_mul(point.clone(), scalar.clone())
        .expect("secp256k1_mul failed");
    let result2 = api
        .secp256k1_mul(point, scalar)
        .expect("secp256k1_mul failed");

    // Should be deterministic
    assert_eq!(result1.point.x, result2.point.x);
    assert_eq!(result1.point.y, result2.point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_secp256k1_reduce512_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let large_scalar_512 = [0xffu8; 64];

    let reduced1 = api
        .secp256k1_reduce512(&large_scalar_512)
        .expect("secp256k1_reduce512 failed");
    let reduced2 = api
        .secp256k1_reduce512(&large_scalar_512)
        .expect("secp256k1_reduce512 failed");

    // Reduction should be deterministic
    assert_eq!(reduced1.value, reduced2.value);

    api.destroy().expect("Failed to destroy backend");
}
