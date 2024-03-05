use nargo::NargoError;
use thiserror::Error;
use fs::errors::FilesystemError;

#[derive(Debug, Error)]
pub(crate) enum CliError {
    /// Filesystem errors
    #[error(transparent)]
    FilesystemError(#[from] FilesystemError),

    /// Error related to circuit deserialization
    #[error("Error: failed to deserialize circuit")]
    CircuitDeserializationError(),

    /// Error related to circuit execution
    #[error(transparent)]
    CircuitExecutionError(#[from] NargoError),

    #[error(" Error: failed to serialize output witness.")]
    OutputWitnessSerializationFailed(),
}
