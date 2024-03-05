use std::path::PathBuf;

use thiserror::Error;
use noirc_abi::errors::InputParserError;
use hex::FromHexError;
use acvm::acir::native_types::WitnessMapError;

#[derive(Debug, Error)]
pub enum FilesystemError {
    #[error("Error: {} is not a valid path\nRun either `nargo compile` to generate missing build artifacts or `nargo prove` to construct a proof", .0.display())]
    PathNotValid(PathBuf),
    #[error("Error: could not parse hex build artifact (proof, proving and/or verification keys, ACIR checksum) ({0})")]
    HexArtifactNotValid(FromHexError),
    #[error(
        " Error: cannot find {0}.toml file.\n Expected location: {1:?} \n Please generate this file at the expected location."
    )]
    MissingTomlFile(String, PathBuf),

    /// Input parsing error
    #[error(transparent)]
    InputParserError(#[from] InputParserError),

    /// WitnessMap serialization error
    #[error(transparent)]
    WitnessMapSerialization(#[from] WitnessMapError),

    #[error("Error: could not deserialize build program: {0}")]
    ProgramSerializationError(String),

    #[error(" Error: failed to parse toml file {0}.")]
    InvalidTomlFile(String),

    #[error(
      " Error: cannot find {0} in expected location {1:?}.\n Please generate this file at the expected location."
    )]
    MissingBytecodeFile(String, PathBuf),

    #[error(" Error: failed to read bytecode file {0}.")]
    InvalidBytecodeFile(String),

    #[error(" Error: failed to create output witness file {0}.")]
    OutputWitnessCreationFailed(String),

    #[error(" Error: failed to write output witness file {0}.")]
    OutputWitnessWriteFailed(String),

    /// Input Witness Value Error
    #[error("Error: failed to parse witness value {0}")]
    WitnessValueError(String),

    /// Input Witness Index Error
    #[error("Error: failed to parse witness index {0}")]
    WitnessIndexError(String),
}
