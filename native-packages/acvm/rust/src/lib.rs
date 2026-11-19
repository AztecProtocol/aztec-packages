//! The ACVM as an ipc-codegen service: solves compiled Noir (ACIR) programs to a witness, with
//! every oracle (Brillig foreign call) answered by the caller through the Oracle service.
//!
//! One handler serves every build, and reaches the Oracle service through its host's `oracle`
//! host-call target: a wasm module through its import, the native library through the function
//! its host passes to `acvm_ipc_ffi_set_host_call`, and `aztec-acvm` at the path its
//! `--host-call oracle=<path>` argument names.

/// ipc-codegen's output for both schemas (bootstrap.sh generates it).
#[allow(dead_code, unreachable_patterns)]
pub mod generated {
    pub mod acvm {
        pub mod acvm_client;
        pub mod acvm_server;
        pub mod acvm_types;
        pub mod backend;
        pub mod error;
        pub mod host_call_backend;

        #[cfg(feature = "ffi")]
        pub mod acvm_ffi;
        #[cfg(feature = "ipc-runtime")]
        pub mod process_host_calls;
    }
    pub mod oracle {
        pub mod backend;
        pub mod error;
        pub mod oracle_client;
        pub mod oracle_server;
        pub mod oracle_types;
    }
}

mod executor;
mod handler;

pub use executor::{execute, Execution, ForeignCallResolver, Solved};
pub use handler::{AcvmHandler, HostOracle, ORACLE_HOST_CALL_TARGET};

#[cfg(feature = "ffi")]
crate::export_acvm_ffi!(
    crate::generated::acvm::acvm_ffi,
    crate::handler::AcvmHandler
);
