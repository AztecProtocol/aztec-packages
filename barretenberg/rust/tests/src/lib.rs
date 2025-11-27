//! Barretenberg Rust test suite
//!
//! This test suite parallels the TypeScript test suite in barretenberg/ts/src/barretenberg.
//!
//! ## Test Categories
//!
//! 1. **MockBackend tests** (`mock_backend_test.rs`): Always run, verify API structure
//! 2. **Integration tests** (`blake2s.rs`, `pedersen.rs`, `poseidon.rs`, `pipe_test.rs`):
//!    Require the BB binary with msgpack API support. Tests fail if binary is missing.
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

pub mod blake2s;
pub mod pedersen;
pub mod poseidon;
pub mod pipe_test;
pub mod utils;
pub mod mock_backend_test;
pub mod debug_msgpack;

pub use utils::Timer;
