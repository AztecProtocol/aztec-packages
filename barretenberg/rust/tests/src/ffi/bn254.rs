//! BN254 curve tests using FfiBackend
//!
//! Tests for BN254 field operations (sqrt).

#[cfg(test)]
use barretenberg_rs::{
    backends::FfiBackend,
    generated_types::{Bn254G1Point, Bn254G2Point},
    BarretenbergApi,
};

#[test]
fn test_bn254_fr_sqrt_of_zero() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Square root of zero should be zero
    let zero = vec![0u8; 32];

    let response = api.bn254_fr_sqrt(&zero).expect("bn254_fr_sqrt failed");

    assert!(response.is_square_root, "Square root of zero should exist");
    assert_eq!(
        response.value,
        vec![0u8; 32],
        "Square root of zero should be zero"
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_of_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Square root of one should be one
    let mut one = vec![0u8; 32];
    one[31] = 1;

    let response = api.bn254_fr_sqrt(&one).expect("bn254_fr_sqrt failed");

    assert!(response.is_square_root, "Square root of one should exist");
    assert_eq!(
        response.value, one,
        "Square root of one should be one"
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_of_four() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Square root of four should be two
    let mut four = vec![0u8; 32];
    four[31] = 4;

    let response = api.bn254_fr_sqrt(&four).expect("bn254_fr_sqrt failed");

    assert!(response.is_square_root, "Square root of four should exist");

    // The square root should be 2
    let mut expected = vec![0u8; 32];
    expected[31] = 2;
    assert_eq!(
        response.value, expected,
        "Square root of four should be two"
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let mut input = vec![0u8; 32];
    input[31] = 16; // Perfect square

    let response1 = api.bn254_fr_sqrt(&input).expect("bn254_fr_sqrt failed");
    let response2 = api.bn254_fr_sqrt(&input).expect("bn254_fr_sqrt failed");

    // Should be deterministic
    assert_eq!(response1.is_square_root, response2.is_square_root);
    assert_eq!(response1.value, response2.value);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_g1_mul_by_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // BN254 G1 generator: (1, 2)
    let mut x = vec![0u8; 32];
    x[31] = 1;
    let mut y = vec![0u8; 32];
    y[31] = 2;
    let point = Bn254G1Point { x, y };

    let mut scalar = vec![0u8; 32];
    scalar[31] = 1; // scalar = 1

    let response = api
        .bn254_g1_mul(point.clone(), &scalar)
        .expect("bn254_g1_mul failed");

    // 1 * G should return G
    assert_eq!(response.point.x, point.x);
    assert_eq!(response.point.y, point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_g2_mul_by_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // BN254 G2 generator point coordinates (big-endian 32-byte field elements)
    // x = (x0, x1) where x = x0 + x1 * u in Fq2
    // y = (y0, y1) where y = y0 + y1 * u in Fq2
    let x0: Vec<u8> = vec![
        0x19, 0x80, 0x0b, 0x28, 0xc0, 0x67, 0x27, 0x89, 0x38, 0x94, 0xa2, 0xab, 0x79, 0xfe,
        0xd2, 0xab, 0x2b, 0xca, 0x2a, 0x2e, 0x48, 0x18, 0xad, 0x4a, 0x35, 0x68, 0xe0, 0xcf,
        0xd9, 0x87, 0x94, 0x5e,
    ];
    let x1: Vec<u8> = vec![
        0x09, 0xe6, 0x32, 0xad, 0xa3, 0x36, 0x6a, 0xf3, 0x51, 0x40, 0x1b, 0xa6, 0xd5, 0xd0,
        0x19, 0xe4, 0xcc, 0x95, 0x6f, 0x7b, 0xba, 0x12, 0x4c, 0x04, 0x54, 0xa2, 0xec, 0x15,
        0x47, 0x21, 0x96, 0x72,
    ];
    let y0: Vec<u8> = vec![
        0x18, 0x3c, 0x53, 0x66, 0x82, 0xaf, 0x3e, 0x98, 0xfe, 0xaf, 0x14, 0x54, 0xb1, 0x97,
        0xde, 0xf7, 0xda, 0x13, 0x9c, 0x67, 0xf6, 0x43, 0xb3, 0x66, 0x23, 0x14, 0x7b, 0x4d,
        0x2d, 0x4f, 0x25, 0x41,
    ];
    let y1: Vec<u8> = vec![
        0x29, 0x3d, 0x28, 0x84, 0xa6, 0x43, 0xb9, 0xae, 0x11, 0x32, 0xeb, 0xfb, 0x2e, 0xdf,
        0x11, 0x5b, 0xc6, 0xd0, 0x54, 0xce, 0x0b, 0x89, 0xf9, 0x5e, 0x4a, 0x70, 0x76, 0xfd,
        0x85, 0x45, 0x09, 0x20,
    ];
    let point = Bn254G2Point {
        x: [x0, x1],
        y: [y0, y1],
    };

    let mut scalar = vec![0u8; 32];
    scalar[31] = 1; // scalar = 1

    let response = api
        .bn254_g2_mul(point.clone(), &scalar)
        .expect("bn254_g2_mul failed");

    // 1 * G2 should return G2
    assert_eq!(response.point.x, point.x);
    assert_eq!(response.point.y, point.y);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_g2_mul_by_two() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let x0: Vec<u8> = vec![
        0x19, 0x80, 0x0b, 0x28, 0xc0, 0x67, 0x27, 0x89, 0x38, 0x94, 0xa2, 0xab, 0x79, 0xfe,
        0xd2, 0xab, 0x2b, 0xca, 0x2a, 0x2e, 0x48, 0x18, 0xad, 0x4a, 0x35, 0x68, 0xe0, 0xcf,
        0xd9, 0x87, 0x94, 0x5e,
    ];
    let x1: Vec<u8> = vec![
        0x09, 0xe6, 0x32, 0xad, 0xa3, 0x36, 0x6a, 0xf3, 0x51, 0x40, 0x1b, 0xa6, 0xd5, 0xd0,
        0x19, 0xe4, 0xcc, 0x95, 0x6f, 0x7b, 0xba, 0x12, 0x4c, 0x04, 0x54, 0xa2, 0xec, 0x15,
        0x47, 0x21, 0x96, 0x72,
    ];
    let y0: Vec<u8> = vec![
        0x18, 0x3c, 0x53, 0x66, 0x82, 0xaf, 0x3e, 0x98, 0xfe, 0xaf, 0x14, 0x54, 0xb1, 0x97,
        0xde, 0xf7, 0xda, 0x13, 0x9c, 0x67, 0xf6, 0x43, 0xb3, 0x66, 0x23, 0x14, 0x7b, 0x4d,
        0x2d, 0x4f, 0x25, 0x41,
    ];
    let y1: Vec<u8> = vec![
        0x29, 0x3d, 0x28, 0x84, 0xa6, 0x43, 0xb9, 0xae, 0x11, 0x32, 0xeb, 0xfb, 0x2e, 0xdf,
        0x11, 0x5b, 0xc6, 0xd0, 0x54, 0xce, 0x0b, 0x89, 0xf9, 0x5e, 0x4a, 0x70, 0x76, 0xfd,
        0x85, 0x45, 0x09, 0x20,
    ];
    let point = Bn254G2Point {
        x: [x0, x1],
        y: [y0, y1],
    };

    let mut scalar = vec![0u8; 32];
    scalar[31] = 2; // scalar = 2

    let response = api
        .bn254_g2_mul(point.clone(), &scalar)
        .expect("bn254_g2_mul failed");

    // 2 * G2 should be different from G2
    assert_ne!(response.point.x, point.x);
    // Result should have non-zero coordinates
    assert_ne!(response.point.x[0], vec![0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fq_sqrt() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test Fq sqrt (base field) with a perfect square
    let mut four = vec![0u8; 32];
    four[31] = 4;

    let response = api.bn254_fq_sqrt(&four).expect("bn254_fq_sqrt failed");

    assert!(response.is_square_root, "Square root of four in Fq should exist");

    let mut expected = vec![0u8; 32];
    expected[31] = 2;
    assert_eq!(response.value, expected);

    api.destroy().expect("Failed to destroy backend");
}
