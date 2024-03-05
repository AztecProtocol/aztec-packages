use nargo::{errors::CompileError, NargoError};
use nargo_toml::ManifestError;
use noir_debugger::errors::DapError;
use noirc_abi::errors::AbiError;
use std::path::PathBuf;
use thiserror::Error;
use fs::errors::FilesystemError;

#[derive(Debug, Error)]
pub(crate) enum CliError {
    #[error("{0}")]
    Generic(String),
    #[error("Error: destination {} already exists", .0.display())]
    DestinationAlreadyExists(PathBuf),

    #[error("Failed to verify proof {}", .0.display())]
    InvalidProof(PathBuf),

    #[error("Invalid package name {0}. Did you mean to use `--name`?")]
    InvalidPackageName(String),

    /// ABI encoding/decoding error
    #[error(transparent)]
    AbiError(#[from] AbiError),

    /// Filesystem errors
    #[error(transparent)]
    FilesystemError(#[from] FilesystemError),

    #[error(transparent)]
    LspError(#[from] async_lsp::Error),

    #[error(transparent)]
    DapError(#[from] DapError),

    /// Error from Nargo
    #[error(transparent)]
    NargoError(#[from] NargoError),

    /// Error from Manifest
    #[error(transparent)]
    ManifestError(#[from] ManifestError),

    /// Error from the compilation pipeline
    #[error(transparent)]
    CompileError(#[from] CompileError),

    /// Error related to backend selection/installation.
    #[error(transparent)]
    BackendError(#[from] BackendError),

    /// Error related to communication with backend.
    #[error(transparent)]
    BackendCommunicationError(#[from] backend_interface::BackendError),
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum BackendError {
    #[error("No backend is installed with the name {0}")]
    UnknownBackend(String),

    #[error("The backend {0} is already installed")]
    AlreadyInstalled(String),

    #[error("Backend installation failed: {0}")]
    InstallationError(#[from] std::io::Error),
}
