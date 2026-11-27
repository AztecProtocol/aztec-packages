//! The ACVM as an ipc-codegen service: solves compiled Noir (ACIR) programs to a witness, with
//! every oracle (Brillig foreign call) answered by the caller through the Oracle service.
//!
//! One handler serves every build, and reaches the Oracle service through its host's `oracle`
//! host-call target: a wasm module through its import, the native library through the function
//! its host passes to `acvm_ipc_ffi_set_host_call`, and `aztec-acvm` at the path its
//! `--host-call oracle=<path>` argument names. Each execution awaits its foreign calls: the wasm
//! module and the native library export asynchronous instances, on which an execution waiting on
//! its oracle lets the instance take other requests; the binary blocks on each call.

/// ipc-codegen's output for both schemas (bootstrap.sh generates it).
#[allow(dead_code, unreachable_patterns)]
pub mod generated {
    pub mod acvm {
        pub mod acvm_client;
        pub mod acvm_server;
        pub mod acvm_types;

        #[cfg(feature = "ffi")]
        pub mod acvm_ffi;
    }
    pub mod oracle {
        pub mod oracle_client;
        pub mod oracle_server;
        pub mod oracle_types;
    }
}

mod abi;
mod executor;
mod handler;

pub use abi::{
    abi_decode, abi_decode_error, abi_encode, compress_witness_stack, decompress_witness_stack,
};
pub use executor::{execute, Execution, ForeignCallResolver, Solved};
pub use handler::{host_oracle, AcvmHandler, ORACLE_HOST_CALL_TARGET};

#[cfg(feature = "ffi")]
crate::export_acvm_ffi!(
    crate::generated::acvm::acvm_ffi,
    crate::handler::AcvmHandler,
    asynchronous
);
