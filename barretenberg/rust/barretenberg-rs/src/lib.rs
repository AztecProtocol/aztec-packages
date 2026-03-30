//! # Barretenberg Rust Bindings
//!
//! High-performance Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over pluggable backends.
//!
//! ## Usage with UdsBackend (Unix Domain Socket)
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, backends::UdsBackend};
//!
//! // Connect to a running BB server
//! let backend = UdsBackend::connect("/tmp/bb.sock")?;
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
//!         todo!()
//!     }
//!
//!     fn destroy(&mut self) -> Result<()> {
//!         Ok(())
//!     }
//! }
//! ```

pub mod backend;
pub mod types;
pub mod error;

// Generated code from msgpack schema (in generated/ subdirectory).
// Run: cd ../codegen && ./bootstrap.sh generate
pub mod generated {
    pub mod bb_types;
    pub mod bb_client;
}

pub use backend::Backend;
pub use types::{Fr, Point};
pub use generated::bb_types::BbGrumpkinPoint;
pub use generated::bb_client::BarretenbergApi;
pub use error::{BarretenbergError, Result};

/// Backend implementations
pub mod backends {
    /// UDS (Unix Domain Socket) backend — connects to a running BB server.
    /// Uses the standard 4-byte LE length-prefixed msgpack protocol.
    #[cfg(feature = "native")]
    pub mod uds;
    #[cfg(feature = "native")]
    pub use uds::UdsBackend;

    /// FFI backend — calls into libbarretenberg.a directly via C FFI.
    /// Avoids IPC overhead but requires linking against the library.
    #[cfg(feature = "ffi")]
    pub mod ffi;
    #[cfg(feature = "ffi")]
    pub use ffi::FfiBackend;
}
