//! Smoke tests for the deprecated `BarretenbergApi` back-compat shim.
//!
//! Exercises a handful of methods whose signatures changed between the
//! pre-codegen and codegen surface (typed scalars vs `&[u8]`,
//! `Vec<Fr>` vs `Vec<Vec<u8>>`). Confirms the shim still accepts the old
//! shape and forwards correctly.

#![cfg(feature = "ffi")]
#![allow(deprecated)]

use barretenberg_rs::{BarretenbergApi, FfiBackend};

#[test]
fn shim_pedersen_hash_old_surface() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Old surface: Vec<Vec<u8>> (32-byte buffers per scalar).
    let inputs: Vec<Vec<u8>> = vec![{
        let mut b = vec![0u8; 32];
        b[31] = 1;
        b
    }];

    let response = api
        .pedersen_hash(inputs, 0)
        .expect("pedersen_hash via shim failed");
    assert_ne!(response.hash.0, [0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn shim_schnorr_compute_public_key_old_surface() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Old surface: &[u8] for private_key.
    let private_key = vec![{
        let mut b = [0u8; 32];
        b[31] = 1;
        b
    }]
    .pop()
    .unwrap();

    let response = api
        .schnorr_compute_public_key(&private_key)
        .expect("schnorr_compute_public_key via shim failed");
    assert_ne!(response.public_key.x.0, [0u8; 32]);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn shim_bn254_fr_sqrt_old_surface() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    // Old surface: &[u8] for input.
    let mut four = vec![0u8; 32];
    four[31] = 4;

    let response = api
        .bn254_fr_sqrt(&four)
        .expect("bn254_fr_sqrt via shim failed");
    assert!(response.is_square_root);
    assert_eq!(response.value.0[31], 2);

    api.destroy().expect("Failed to destroy backend");
}
