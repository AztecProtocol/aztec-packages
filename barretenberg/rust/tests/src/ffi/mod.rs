//! FFI backend tests
//!
//! These tests use FfiBackend which links directly to libbarretenberg.
//! They parallel the PipeBackend tests but use direct FFI calls for better performance.
//!
//! Enable with: cargo test --features ffi

#[cfg(feature = "ffi")]
pub mod aes;
#[cfg(feature = "ffi")]
pub mod blake2s;
#[cfg(feature = "ffi")]
pub mod bn254;
#[cfg(feature = "ffi")]
pub mod ecdsa;
#[cfg(feature = "ffi")]
pub mod grumpkin;
#[cfg(feature = "ffi")]
pub mod pedersen;
#[cfg(feature = "ffi")]
pub mod poseidon;
#[cfg(feature = "ffi")]
pub mod schnorr;
#[cfg(feature = "ffi")]
pub mod secp256k1;
