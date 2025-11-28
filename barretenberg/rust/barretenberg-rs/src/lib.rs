//! # Barretenberg Rust Bindings
//!
//! High-performance Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over pluggable backends.
//!
//! ## Architecture
//!
//! This crate provides a flexible backend system:
//!
//! 1. **PipeBackend** (production): Communicates via stdin/stdout with the BB binary
//! 2. **MockBackend** (testing): Returns predefined responses for unit tests
//! 3. **Custom Backend**: Implement the `Backend` trait for your use case (WASM, FFI, etc.)
//!
//! ## Quick Start with MockBackend (for testing)
//!
//! ```
//! use barretenberg_rs::{BarretenbergApi, mock_backend::MockBackend};
//!
//! let backend = MockBackend::new();
//! let mut api = BarretenbergApi::new(backend);
//!
//! // Call methods - they return mock responses
//! let response = api.blake2s(b"test data").unwrap();
//! assert_eq!(response.hash.len(), 32);
//! ```
//!
//! ## Production Usage with PipeBackend
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, backends::PipeBackend};
//!
//! // Create a pipe backend (requires BB binary)
//! let backend = PipeBackend::new("/path/to/bb", Some(4))?;
//! let mut api = BarretenbergApi::new(backend);
//!
//! // Use the API
//! let response = api.blake2s(b"hello world")?;
//! println!("Hash: {:?}", response.hash);
//!
//! // Cleanup
//! api.destroy()?;
//! ```
//!
//! ## Custom Backend
//!
//! Implement the `Backend` trait for custom IPC strategies:
//!
//! ```
//! use barretenberg_rs::{Backend, BarretenbergError, Result};
//!
//! struct MyBackend {
//!     // Your implementation (WASM module, FFI handle, network connection, etc.)
//! }
//!
//! impl Backend for MyBackend {
//!     fn call(&mut self, request: &[u8]) -> Result<Vec<u8>> {
//!         // Send msgpack request, receive msgpack response
//!         // The request is a msgpack-encoded Vec<Command>
//!         // The response should be a msgpack-encoded Response
//!         todo!()
//!     }
//!
//!     fn destroy(&mut self) -> Result<()> {
//!         // Cleanup resources
//!         Ok(())
//!     }
//! }
//! ```

pub mod backend;
pub mod types;
pub mod api;
pub mod error;
pub mod mock_backend;

// Generated types from msgpack schema
// Run: cd ../ts && yarn generate
pub mod generated_types;

pub use backend::Backend;
pub use types::{Fr, Point};
pub use generated_types::{Command, Response, AffineElement};
pub use api::BarretenbergApi;
pub use error::{BarretenbergError, Result};

/// Backend implementations
///
/// - `PipeBackend`: Production backend using stdin/stdout with BB binary
/// - `MockBackend`: Testing backend with predefined responses (see `mock_backend` module)
/// - Implement `Backend` trait for custom backends
#[cfg(feature = "native")]
pub mod backends {
    pub mod pipe;
    pub use pipe::PipeBackend;
}
