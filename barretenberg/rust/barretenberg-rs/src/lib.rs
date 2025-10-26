//! Barretenberg Rust bindings with msgpack backend support
//!
//! This crate provides Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over various backends (shared memory, IPC, WASM).

pub mod backend;
pub mod types;
pub mod api;
pub mod error;

// Generated types from msgpack schema
// Run: cd ../ts && npm run generate
pub mod generated_types;

pub use backend::{MsgpackBackend, MsgpackBackendSync};
#[cfg(feature = "async")]
pub use backend::MsgpackBackendAsync;
pub use types::{Fr, Point}; // Keep utility types
pub use generated_types::{Command, Response}; // Use generated enums
pub use api::BarretenbergApiSync;
#[cfg(feature = "async")]
pub use api::BarretenbergApi;
pub use error::{BarretenbergError, Result};

#[cfg(feature = "native")]
pub mod backends {
    pub mod shared_memory;
    pub mod unix_socket;
    pub mod pipe;

    pub use shared_memory::SharedMemoryBackend;
    pub use unix_socket::UnixSocketBackend;
    pub use pipe::PipeBackend;
}

#[cfg(feature = "wasm")]
pub mod backends {
    pub mod wasm;

    pub use wasm::WasmBackend;
}
