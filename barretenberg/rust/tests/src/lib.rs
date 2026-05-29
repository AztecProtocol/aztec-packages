//! Barretenberg Rust test suite.
//!
//! Parallels the TypeScript test suite in barretenberg/ts/src/barretenberg.
//! All integration tests run through the FFI backend — build BB locally
//! first (`barretenberg/cpp/bootstrap.sh`) so `libbarretenberg` is on the
//! link path, then `cargo test --features ffi --release`.

pub mod debug_msgpack;

#[cfg(feature = "ffi")]
pub mod ffi;

#[cfg(feature = "ffi")]
pub mod legacy_shim;
