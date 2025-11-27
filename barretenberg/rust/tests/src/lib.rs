//! Barretenberg Rust test suite
//!
//! This test suite parallels the TypeScript test suite in barretenberg/ts/src/barretenberg.
//!
//! ## Test Categories
//!
//! 1. **MockBackend tests** (`mock_backend_test.rs`): Always run, verify API structure
//! 2. **Integration tests** (`blake2s.rs`, `pedersen.rs`, `poseidon.rs`, `pipe_test.rs`):
//!    Require the BB binary with msgpack API support. These tests skip gracefully
//!    if the BB binary is not found.
//!
//! ## Running Integration Tests
//!
//! The integration tests require a BB binary built with msgpack API support:
//!
//! ```bash
//! # Set the path to your BB binary
//! export BB_BINARY_PATH=/path/to/bb
//!
//! # Run all tests
//! cargo test --release
//! ```
//!
//! Note: The msgpack API (`bb msgpack run`) is a new feature. Integration tests
//! will skip if the binary doesn't support it.

pub mod blake2s;
pub mod pedersen;
pub mod poseidon;
pub mod pipe_test;
pub mod utils;
pub mod mock_backend_test;
pub mod debug_msgpack;

pub use utils::Timer;
