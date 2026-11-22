//! Error types for generated IPC clients.
//!
//! [`IpcError::Service`] is the service answering a command with its error response: the request
//! arrived and was refused. Every other variant is a fault on the way there or back (the transport,
//! the encoding, an unexpected response), the same split as C++'s `ipc_codegen::ServiceError`,
//! Zig's `error.ServiceError` and the TypeScript `<Service>Error`.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum IpcError {
    /// The service's error response, with its message.
    #[error("{0}")]
    Service(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("Backend error: {0}")]
    Backend(String),

    #[error("IPC error: {0}")]
    Ipc(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("WASM error: {0}")]
    Wasm(String),
}

pub type Result<T> = std::result::Result<T, IpcError>;
