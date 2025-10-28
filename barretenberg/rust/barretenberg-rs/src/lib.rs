//! # Barretenberg Rust Bindings
//!
//! High-performance Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over stdin/stdout pipes.
//!
//! ## Architecture
//!
//! This crate provides two ways to use Barretenberg:
//!
//! 1. **PipeBackend** (recommended): Simple stdin/stdout IPC
//! 2. **Custom Backend**: Implement the `Backend` trait for your use case
//!
//! ## Quick Start
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, backends::PipeBackend};
//!
//! // Create a pipe backend (simplest approach)
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
//! ```ignore
//! use barretenberg_rs::{Backend, BarretenbergError, Result};
//!
//! struct MyBackend {
//!     // Your implementation
//! }
//!
//! impl Backend for MyBackend {
//!     fn call(&mut self, request: &[u8]) -> Result<Vec<u8>> {
//!         // Send msgpack request, receive msgpack response
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

// Generated types from msgpack schema
// Run: cd ../ts && npm run generate
pub mod generated_types;

pub use backend::Backend;
pub use types::{Fr, Point};
pub use generated_types::{Command, Response};
pub use api::BarretenbergApi;
pub use error::{BarretenbergError, Result};

/// Backend implementations
///
/// - `PipeBackend`: Recommended default using stdin/stdout
/// - Implement `Backend` trait for custom backends
#[cfg(feature = "native")]
pub mod backends {
    pub mod pipe;
    pub use pipe::PipeBackend;
}
