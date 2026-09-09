// Generated modules live in src/generated/. Transport comes from the
// `ipc-runtime` crate; the per-language UDS template that used to live
// here (ipc_server.rs / uds_backend.rs) is gone — the runtime is shared.
pub mod generated {
    pub mod backend;
    pub mod echo_client;
    #[cfg(feature = "ffi")]
    pub mod echo_ffi;
    pub mod echo_server;
    pub mod echo_types;
    pub mod error;
    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

pub mod handler;

// Re-export under the names that generated server/client code expects
// (they use `crate::types_gen`, `crate::error`, `crate::backend`)
pub use generated::backend;
pub use generated::echo_types as types_gen;
pub use generated::error;

// The service as an in-process library: the generated FFI entry over the same
// handler the socket server uses. With `ffi_backend` in the same crate, the
// generated client can call it without any process (see tests/ffi_roundtrip.rs).
#[cfg(feature = "ffi")]
crate::export_echo_ffi!(crate::generated::echo_ffi, crate::handler::EchoHandler);
