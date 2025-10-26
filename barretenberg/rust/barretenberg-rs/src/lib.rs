//! Barretenberg Rust bindings with msgpack backend support
//!
//! This crate provides Rust bindings to the Barretenberg cryptographic library
//! using msgpack protocol over various pluggable backends.
//!
//! # Example
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, backends::UnixSocketBackend};
//!
//! let backend = UnixSocketBackend::new("/path/to/bb", "/tmp/bb.sock", Some(4))?;
//! let mut api = BarretenbergApi::new(backend);
//!
//! let response = api.blake2s(b"hello world")?;
//! println!("Hash: {:?}", response.hash);
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

#[cfg(feature = "native")]
pub mod backends {
    pub mod shared_memory;
    pub mod unix_socket;
    pub mod pipe;

    pub use shared_memory::SharedMemoryBackend;
    pub use unix_socket::UnixSocketBackend;
    pub use pipe::PipeBackend;
}
