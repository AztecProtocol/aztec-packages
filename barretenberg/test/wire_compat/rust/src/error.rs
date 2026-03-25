use thiserror::Error;

#[derive(Error, Debug)]
pub enum EchoError {
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Deserialization error: {0}")]
    Deserialization(String),
    #[error("Backend error: {0}")]
    Backend(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

pub type Result<T> = std::result::Result<T, EchoError>;
