//! Barretenberg Rust bindings with msgpack backend support
//!
//! This crate provides Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over various backends (shared memory, IPC, WASM).

pub mod backend;
pub mod types;
pub mod api;
pub mod error;

pub use backend::{MsgpackBackend, MsgpackBackendSync, MsgpackBackendAsync};
pub use types::*;
pub use api::{BarretenbergApi, BarretenbergApiSync};
pub use error::{BarretenbergError, Result};

#[cfg(feature = "native")]
pub mod backends {
    pub mod shared_memory;
    pub mod unix_socket;

    pub use shared_memory::SharedMemoryBackend;
    pub use unix_socket::UnixSocketBackend;
}

#[cfg(feature = "wasm")]
pub mod backends {
    pub mod wasm;

    pub use wasm::WasmBackend;
}
