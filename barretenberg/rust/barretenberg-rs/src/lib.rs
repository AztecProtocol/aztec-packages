//! # Barretenberg Rust Bindings
//!
//! High-performance Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over pluggable backends.
//!
//! ## Usage with PipeBackend
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

// Bb API bindings produced by `ipc-codegen` from `ipc-codegen/schemas/bb_schema.json`.
// Output lives under src/generated/ and is regenerated on every `yarn generate`.
// NB: ipc-codegen also drops uds_backend.rs into generated/ (because --uds is
// what pulls in the Backend + IpcError templates the client needs), but we
// don't declare it as a module here — barretenberg-rs ships its own pipe
// backend under src/backends/pipe.rs and has no use for the UDS one. Leaving
// uds_backend.rs undeclared keeps non-Unix targets building.
pub mod generated {
    pub mod backend;
    pub mod bb_client;
    pub mod bb_types;
    pub mod error;

    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

mod fr_ext;

pub use generated::backend::Backend;
pub use generated::bb_client::BbApi as BarretenbergApi;
pub use generated::bb_types::{
    Bn254G1Point, Bn254G2Point, Command, Fr, GrumpkinPoint, Response, Secp256k1Point,
    Secp256r1Point,
};
pub use generated::error::{IpcError as BarretenbergError, Result};

// Re-export the full generated types module as `generated_types` for callers
// that imported types directly (e.g. `barretenberg_rs::generated_types::Secp256k1Point`).
pub use generated::bb_types as generated_types;

/// Backend implementations
pub mod backends {
    #[cfg(feature = "native")]
    pub mod pipe;
    #[cfg(feature = "native")]
    pub use pipe::PipeBackend;

    // The FFI backend comes from ipc-codegen (see crate::generated::ffi_backend).
    // Re-export it here to preserve the existing `barretenberg_rs::backends::FfiBackend` path.
    #[cfg(feature = "ffi")]
    pub use crate::generated::ffi_backend::FfiBackend;
}
