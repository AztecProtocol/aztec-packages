// WSDB service example — generated + hand-written code.
//
// To regenerate: ./generate.sh
// Then implement the handlers in wsdb_handlers.rs

pub mod generated {
    pub mod wsdb_types;
    pub mod wsdb_client;
    pub mod wsdb_server;
    pub mod backend;
    pub mod error;

    #[cfg(feature = "uds")]
    pub mod uds_backend;

    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

pub use generated::backend::Backend;
pub use generated::error::{BarretenbergError, Result};
