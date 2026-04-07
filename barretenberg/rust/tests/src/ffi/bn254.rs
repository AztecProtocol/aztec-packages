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
fn test_bn254_g1_mul_consistency() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // BN254 G1 generator: (1, 2)
    let mut x = vec![0u8; 32];
    x[31] = 1;
    let mut y = vec![0u8; 32];
    y[31] = 2;
    let g1 = Bn254G1Point { x, y };

    let mut two = vec![0u8; 32];
    two[31] = 2;
    let mut three = vec![0u8; 32];
    three[31] = 3;

    // Verify 2*(3*G1) == 3*(2*G1) == 6*G1
    let result_3g = api
        .bn254_g1_mul(g1.clone(), &three)
        .expect("bn254_g1_mul(3) failed");
    let result_2_of_3g = api
        .bn254_g1_mul(result_3g.point.clone(), &two)
        .expect("bn254_g1_mul(2*3G) failed");

    let result_2g = api
        .bn254_g1_mul(g1.clone(), &two)
        .expect("bn254_g1_mul(2) failed");
    let result_3_of_2g = api
        .bn254_g1_mul(result_2g.point.clone(), &three)
        .expect("bn254_g1_mul(3*2G) failed");

    assert_eq!(result_2_of_3g.point.x, result_3_of_2g.point.x);
    assert_eq!(result_2_of_3g.point.y, result_3_of_2g.point.y);

    // Sanity: result differs from generator
    assert_ne!(result_2_of_3g.point.x, g1.x);

    api.destroy().expect("Failed to destroy backend");
}

// BN254 G2 generator point (EIP-197)
// x = (c0, c1), y = (c0, c1) in Fq2, big-endian 32-byte field elements
#[cfg(test)]
fn bn254_g2_generator() -> Bn254G2Point {
    Bn254G2Point {
        x: [
            vec![
                0x18, 0x00, 0xde, 0xef, 0x12, 0x1f, 0x1e, 0x76, 0x42, 0x6a, 0x00, 0x66, 0x5e,
                0x5c, 0x44, 0x79, 0x67, 0x43, 0x22, 0xd4, 0xf7, 0x5e, 0xda, 0xdd, 0x46, 0xde,
                0xbd, 0x5c, 0xd9, 0x92, 0xf6, 0xed,
            ],
            vec![
                0x19, 0x8e, 0x93, 0x93, 0x92, 0x0d, 0x48, 0x3a, 0x72, 0x60, 0xbf, 0xb7, 0x31,
                0xfb, 0x5d, 0x25, 0xf1, 0xaa, 0x49, 0x33, 0x35, 0xa9, 0xe7, 0x12, 0x97, 0xe4,
                0x85, 0xb7, 0xae, 0xf3, 0x12, 0xc2,
            ],
        ],
        y: [
            vec![
                0x12, 0xc8, 0x5e, 0xa5, 0xdb, 0x8c, 0x6d, 0xeb, 0x4a, 0xab, 0x71, 0x80, 0x8d,
                0xcb, 0x40, 0x8f, 0xe3, 0xd1, 0xe7, 0x69, 0x0c, 0x43, 0xd3, 0x7b, 0x4c, 0xe6,
                0xcc, 0x01, 0x66, 0xfa, 0x7d, 0xaa,
            ],
            vec![
                0x09, 0x06, 0x89, 0xd0, 0x58, 0x5f, 0xf0, 0x75, 0xec, 0x9e, 0x99, 0xad, 0x69,
                0x0c, 0x33, 0x95, 0xbc, 0x4b, 0x31, 0x33, 0x70, 0xb3, 0x8e, 0xf3, 0x55, 0xac,
                0xda, 0xdc, 0xd1, 0x22, 0x97, 0x5b,
            ],
        ],
    }
}

#[test]
fn test_bn254_g2_mul_consistency() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let g2 = bn254_g2_generator();

    // Compute 3*G2 directly
    let mut three = vec![0u8; 32];
    three[31] = 3;
    let result_3g = api
        .bn254_g2_mul(g2.clone(), &three)
        .expect("bn254_g2_mul(3) failed");

    // Compute 3*G2 as 2*G2 then add G2 via scalar mul of the same point:
    // We can verify by computing 6*G2 two ways: 2*(3*G2) vs 3*(2*G2)
    let mut two = vec![0u8; 32];
    two[31] = 2;
    let result_2_of_3g = api
        .bn254_g2_mul(result_3g.point.clone(), &two)
        .expect("bn254_g2_mul(2*3G) failed");

    let result_2g = api
        .bn254_g2_mul(g2.clone(), &two)
        .expect("bn254_g2_mul(2) failed");
    let result_3_of_2g = api
        .bn254_g2_mul(result_2g.point.clone(), &three)
        .expect("bn254_g2_mul(3*2G) failed");

    // 2*(3*G2) == 3*(2*G2) == 6*G2
    assert_eq!(result_2_of_3g.point.x, result_3_of_2g.point.x);
    assert_eq!(result_2_of_3g.point.y, result_3_of_2g.point.y);

    // Sanity: result differs from generator
    assert_ne!(result_2_of_3g.point.x, g2.x);

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
