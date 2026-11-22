// Generated modules live in src/generated/. What they run on (the Backend traits, the error type,
// host calls, asynchronous instances and the transport) comes from the `ipc-runtime` crate.
pub mod generated {
    pub mod echo_client;
    #[cfg(feature = "ffi")]
    pub mod echo_ffi;
    pub mod echo_server;
    pub mod echo_types;
    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

pub mod handler;

pub use generated::echo_types as types_gen;
pub use ipc_runtime::{backend, error};

// The service as an in-process library: the generated FFI exports over the same
// handler the socket server uses. With `ffi_backend` in the same crate, the
// generated client can call it without any process (see tests/ffi_roundtrip.rs).
#[cfg(feature = "ffi")]
crate::export_echo_ffi!(
    crate::generated::echo_ffi,
    crate::handler::EchoHandler,
    asynchronous
);
