//! # Barretenberg Rust Bindings
//!
//! High-performance Rust bindings to the Barretenberg cryptographic library.
//! Two backends available:
//!
//! - **UDS** (`--features uds`): Connect to a running BB server via Unix domain socket
//! - **FFI** (`--features ffi`): Link against libbarretenberg.a, call directly (no IPC)
//!
//! ## Example (UDS)
//!
//! ```ignore
//! use barretenberg_rs::generated::{uds_backend::UdsBackend, bb_client::BarretenbergApi};
//!
//! let backend = UdsBackend::connect("/tmp/bb.sock")?;
//! let mut api = BarretenbergApi::new(backend);
//! let resp = api.blake2s(b"hello")?;
//! ```
//!
//! ## Example (FFI)
//!
//! ```ignore
//! use barretenberg_rs::generated::{ffi_backend::FfiBackend, bb_client::BarretenbergApi};
//!
//! let mut api = BarretenbergApi::new(FfiBackend);
//! let resp = api.blake2s(b"hello")?;
//! ```

// Everything is codegen-generated or template-copied into generated/.
// Run: cd barretenberg/codegen && ./bootstrap.sh generate
pub mod generated {
    pub mod bb_types;
    pub mod bb_client;
    pub mod backend;
    pub mod error;

    #[cfg(feature = "uds")]
    pub mod uds_backend;

    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

// Re-exports for convenience
pub use generated::backend::Backend;
pub use generated::error::{BarretenbergError, Result};
pub use generated::bb_client::BarretenbergApi;
pub use generated::bb_types::BbGrumpkinPoint;

#[cfg(feature = "uds")]
pub use generated::uds_backend::UdsBackend;

#[cfg(feature = "ffi")]
pub use generated::ffi_backend::FfiBackend;
