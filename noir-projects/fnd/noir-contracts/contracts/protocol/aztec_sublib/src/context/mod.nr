//! Execution context types for protocol contracts.

pub mod inputs;
pub mod returns_hash;
pub mod private_context;
pub mod public_context;
pub mod utility_context;
pub mod gas;
pub mod nullifier_existence_request;

pub use gas::GasOpts;
pub use inputs::PrivateContextInputs;
pub use nullifier_existence_request::NullifierExistenceRequest;
pub use private_context::PrivateContext;
pub use public_context::PublicContext;
pub use returns_hash::ReturnsHash;
pub use utility_context::UtilityContext;
