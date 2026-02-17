//! BN254 curve tests using FfiBackend
//!
//! Tests for BN254 field operations (sqrt).

#[cfg(test)]
use barretenberg_rs::{backends::FfiBackend, BarretenbergApi};

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
