use acvm::{acir::circuit::OpcodeLocation, pwg::OpcodeResolutionError};
use thiserror::Error;

#[derive(Debug, thiserror::Error)]
pub enum ACVMError {
    /// ACIR circuit execution error
    #[error(transparent)]
    ExecutionError(#[from] ExecutionError),
}

#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("Failed assertion: '{}'", .0)]
    AssertionFailed(String, Vec<OpcodeLocation>),

    #[error(transparent)]
    SolvingError(#[from] OpcodeResolutionError),
}
