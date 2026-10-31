//! The ACVM as an ipc-codegen service: solves compiled Noir (ACIR) programs to a witness, with
//! every oracle (Brillig foreign call) answered by the caller through the Oracle service.
//!
//! One handler serves both builds. Natively, `aztec-acvm` serves it over ipc-runtime and reaches the
//! Oracle service over a socket the caller serves; as a wasm module it is the FFI entry, and reaches
//! the Oracle service through the host's `oracle` host-call target, the host suspending the module
//! while it answers.

/// ipc-codegen's output for both schemas (bootstrap.sh generates it).
#[allow(dead_code, unreachable_patterns)]
pub mod generated {
    pub mod acvm {
        pub mod acvm_client;
        pub mod acvm_server;
        pub mod acvm_types;
        pub mod backend;
        pub mod error;

        #[cfg(feature = "wasm")]
        pub mod acvm_ffi;
    }
    pub mod oracle {
        pub mod backend;
        pub mod error;
        pub mod host_call_backend;
        pub mod oracle_client;
        pub mod oracle_server;
        pub mod oracle_types;
    }
}

mod executor;
mod handler;

pub use executor::{execute, Execution, ForeignCallResolver, Solved};
pub use handler::{AcvmHandler, OracleBackend};

#[cfg(feature = "wasm")]
crate::export_acvm_ffi!(
    crate::generated::acvm::acvm_ffi,
    crate::handler::AcvmHandler
);
