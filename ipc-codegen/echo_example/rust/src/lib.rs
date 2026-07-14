// Generated modules live in src/generated/. Transport comes from the
// `ipc-runtime` crate; the per-language UDS template that used to live
// here (ipc_server.rs / uds_backend.rs) is gone — the runtime is shared.
pub mod generated {
    pub mod backend;
    pub mod echo_client;
    pub mod echo_server;
    pub mod echo_types;
    pub mod error;
    #[cfg(feature = "ffi")]
    pub mod ffi_backend;
}

// Re-export under the names that generated server/client code expects
// (they use `crate::types_gen`, `crate::error`, `crate::backend`)
pub use generated::backend;
pub use generated::echo_types as types_gen;
pub use generated::error;
