//! Private, public and utility execution contexts.

pub mod globals;
pub mod inputs;

mod returns_hash;
pub use returns_hash::ReturnsHash;

mod private_context;
pub use private_context::PrivateContext;

mod public_context;
pub use public_context::PublicContext;

mod utility_context;
pub use utility_context::UtilityContext;

pub mod calls;
pub use calls::{PrivateCall, PrivateStaticCall, PublicCall, PublicStaticCall, UtilityCall};

pub mod gas;

mod note_existence_request;
pub use note_existence_request::NoteExistenceRequest;

mod nullifier_existence_request;
pub use nullifier_existence_request::NullifierExistenceRequest;
