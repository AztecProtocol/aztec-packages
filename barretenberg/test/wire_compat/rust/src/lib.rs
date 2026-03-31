// Generated modules live in src/generated/
pub mod generated {
    pub mod echo_types;
    pub mod echo_server;
    pub mod echo_client;
    pub mod backend;
    pub mod error;
    pub mod ipc_server;
    pub mod uds_backend;
}

// Re-export under the names that generated server/client code expects
// (they use `crate::types_gen`, `crate::error`, `crate::backend`)
pub use generated::echo_types as types_gen;
pub use generated::error;
pub use generated::backend;
