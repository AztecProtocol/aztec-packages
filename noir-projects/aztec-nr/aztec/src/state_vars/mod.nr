//! Storage for contract state.
//!
//! Contracts store their state in _state variables_. In Solidity, a state variable is simply any value declared inside
//! a contract, e.g. `contract Token { uint256 totalSupply; }`, and they can be one of many kinds (primitive values,
//! mappings, arrays, immutable, etc.).
//!
//! Due to Aztec contracts being able to store both public and private state, there are many more different types of
//! state variables, each with their nuance and use cases. Understanding these is key to understanding how a contract
//! works.

pub mod map;
pub mod owned_state_variable;
pub mod owned;
mod private_immutable;
pub use private_immutable::PrivateImmutable;
mod single_private_immutable;
pub use single_private_immutable::SinglePrivateImmutable;
mod private_mutable;
pub use private_mutable::PrivateMutable;
mod single_private_mutable;
pub use single_private_mutable::SinglePrivateMutable;
mod public_immutable;
pub use public_immutable::PublicImmutable;
mod public_mutable;
pub use public_mutable::PublicMutable;
mod private_set;
pub use private_set::PrivateSet;
mod delayed_public_mutable;
pub use delayed_public_mutable::DelayedPublicMutable;
mod single_use_claim;
pub use single_use_claim::SingleUseClaim;
pub mod state_variable;
pub mod storage;

pub use crate::state_vars::map::Map;
pub use crate::state_vars::owned::Owned;
pub use crate::state_vars::owned_state_variable::OwnedStateVariable;
pub use crate::state_vars::state_variable::StateVariable;
