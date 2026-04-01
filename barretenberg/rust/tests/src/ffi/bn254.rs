//! BN254 curve tests using FfiBackend

#[cfg(test)]
use barretenberg_rs::{FfiBackend, BbApi, Fr};

#[cfg(test)]
fn fr_val(v: u8) -> Fr {
    let mut bytes = [0u8; 32];
    bytes[31] = v;
    Fr(bytes)
}

#[test]
fn test_bn254_fr_sqrt_of_zero() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response = api.bn254_fr_sqrt(Fr([0u8; 32])).expect("bn254_fr_sqrt failed");
    assert!(response.is_square_root, "Square root of zero should exist");
    assert_eq!(response.value, Fr([0u8; 32]), "Square root of zero should be zero");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_of_one() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let one = fr_val(1);
    let response = api.bn254_fr_sqrt(one.clone()).expect("bn254_fr_sqrt failed");
    assert!(response.is_square_root, "Square root of one should exist");
    assert_eq!(response.value, one, "Square root of one should be one");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_of_four() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response = api.bn254_fr_sqrt(fr_val(4)).expect("bn254_fr_sqrt failed");
    assert!(response.is_square_root, "Square root of four should exist");
    assert_eq!(response.value, fr_val(2), "Square root of four should be two");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fr_sqrt_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response1 = api.bn254_fr_sqrt(fr_val(16)).expect("bn254_fr_sqrt failed");
    let response2 = api.bn254_fr_sqrt(fr_val(16)).expect("bn254_fr_sqrt failed");
    assert_eq!(response1.is_square_root, response2.is_square_root);
    assert_eq!(response1.value, response2.value);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_bn254_fq_sqrt() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BbApi::new(backend);

    let response = api.bn254_fq_sqrt(fr_val(4)).expect("bn254_fq_sqrt failed");
    assert!(response.is_square_root, "Square root of four in Fq should exist");
    assert_eq!(response.value, fr_val(2));

    api.destroy().expect("Failed to destroy backend");
}
