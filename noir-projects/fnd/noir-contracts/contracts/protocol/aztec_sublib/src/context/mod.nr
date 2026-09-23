//! Execution context types for protocol contracts.

pub mod inputs;
pub mod private_context;
pub mod public_context;
pub mod nullifier_existence_request;

pub use inputs::PrivateContextInputs;
pub use nullifier_existence_request::NullifierExistenceRequest;
pub use private_context::PrivateContext;
pub use public_context::PublicContext;
