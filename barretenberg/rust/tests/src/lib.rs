//! Barretenberg Rust test suite
//!
//! This test suite parallels the TypeScript test suite in barretenberg/ts/src/barretenberg.
//!
//! ## Running Tests
//!
//! ```bash
//! # Build BB binary first (from barretenberg root)
//! ./bootstrap.sh
//!
//! # Run all tests
//! cargo test --release
//!
//! # Or set custom BB binary path
//! BB_BINARY_PATH=/path/to/bb cargo test --release
//! ```

pub mod aes;
pub mod blake2s;
pub mod bn254;
pub mod ecdsa;
pub mod grumpkin;
pub mod pedersen;
pub mod poseidon;
pub mod pipe_test;
pub mod schnorr;
pub mod secp256k1;
pub mod utils;
pub mod debug_msgpack;

#[cfg(feature = "ffi")]
pub mod ffi;

pub use utils::Timer;
