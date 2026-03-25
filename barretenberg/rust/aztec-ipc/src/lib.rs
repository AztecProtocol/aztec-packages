//! Aztec IPC Service Clients
//!
//! Generated Rust clients for Aztec IPC services (wsdb, cdb, avm).
//! Each service module contains types and a typed API client.
//!
//! ## Usage
//!
//! ```ignore
//! use aztec_ipc::{uds::UdsBackend, wsdb::api::WsdbApi};
//!
//! let backend = UdsBackend::connect("/tmp/wsdb.sock")?;
//! let mut wsdb = WsdbApi::new(backend);
//! let info = wsdb.get_tree_info(0, revision)?;
//! ```

pub mod backend;
pub mod error;
pub mod uds;

// Per-service generated modules
pub mod wsdb;
pub mod cdb;
pub mod avm;

pub use backend::Backend;
pub use error::{IpcError, Result};
pub use uds::UdsBackend;
