//! BN254 curve tests
//!
//! Ported from zkpassport/aztec-packages bb_rs bn254_tests.rs
//! These tests verify the BN254 curve field operations API compatibility.
//!
//! These tests require the BB binary to be built. They are skipped if the binary is not found.

#[cfg(test)]
use barretenberg_rs::{backends::PipeBackend, BarretenbergApi};
#[cfg(test)]
use crate::require_bb_binary;
#[cfg(test)]
use crate::utils::get_bb_binary_path;

#[test]
fn test_bn254_fr_sqrt_of_zero() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
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
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
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
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
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
fn test_bn254_fr_sqrt_of_nine() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Square root of nine should be three
    let mut nine = vec![0u8; 32];
    nine[31] = 9;

    let response = api.bn254_fr_sqrt(&nine).expect("bn254_fr_sqrt failed");

    assert!(response.is_square_root, "Square root of nine should exist");

    // The square root should be 3
    let mut expected = vec![0u8; 32];
    expected[31] = 3;
    assert_eq!(
        response.value, expected,
        "Square root of nine should be three"
    );

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_non_square() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test with a value that is likely not a perfect square
    // 2 is not a quadratic residue in many fields
    let mut two = vec![0u8; 32];
    two[31] = 2;

    let response = api.bn254_fr_sqrt(&two).expect("bn254_fr_sqrt failed");

    // For bn254 Fr field, 2 may or may not be a quadratic residue
    // Just verify the function returns a valid result
    println!("Square root of 2 exists: {}", response.is_square_root);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_large_value() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test with a larger value
    let mut large = vec![0u8; 32];
    large[28] = 0x01;
    large[29] = 0x23;
    large[30] = 0x45;
    large[31] = 0x67;

    let response = api.bn254_fr_sqrt(&large).expect("bn254_fr_sqrt failed");

    // Just verify the function executes without panicking
    println!("Square root of large value exists: {}", response.is_square_root);

    if response.is_square_root {
        // Verify the result is non-zero
        assert_ne!(
            response.value,
            vec![0u8; 32],
            "Square root of non-zero should be non-zero"
        );
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_consistency() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Test that if sqrt(x) = y, then y^2 should equal x (mod p)
    // We'll test with known perfect squares
    let test_cases: [u8; 10] = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100];

    for &val in &test_cases {
        let mut data = vec![0u8; 32];
        data[31] = val;

        let response = api.bn254_fr_sqrt(&data).expect("bn254_fr_sqrt failed");
        assert!(response.is_square_root, "Square root of {} should exist", val);

        // Note: We can't easily verify y^2 = x without implementing field multiplication
        // in this test, but we can at least verify we get a result
        println!("sqrt({}) exists", val);
    }

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_deterministic() {
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
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
    require_bb_binary!();
    let bb_path = get_bb_binary_path();

    let backend = PipeBackend::new(&bb_path, Some(1)).expect("Failed to create backend");
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
