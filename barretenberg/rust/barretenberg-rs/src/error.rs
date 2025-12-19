//! Error types for Barretenberg operations

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BarretenbergError {
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

pub type Result<T> = std::result::Result<T, BarretenbergError>;
