//! Storage for contract state.
//!
//! Contracts store their state in _state variables_. In Solidity, a state variable is simply any value declared inside
//! a contract, e.g. `contract Token { uint256 totalSupply; }`, and they can be one of many kinds (primitive values,
//! mappings, arrays, immutable, etc.).
//!
//! Due to Aztec contracts being able to store both public and private state, there are many more different types of
//! state variables, each with their nuance and use cases. Understanding these is key to understanding how a contract
//! works.

mod state_variable;
pub use state_variable::StateVariable;

mod owned;
pub use owned::Owned;
mod owned_state_variable;
pub use owned_state_variable::OwnedStateVariable;

mod map;
pub use map::Map;

mod private_immutable;
pub use private_immutable::PrivateImmutable;
mod single_private_immutable;
pub use single_private_immutable::SinglePrivateImmutable;
mod private_mutable;
pub use private_mutable::PrivateMutable;
mod single_private_mutable;
pub use single_private_mutable::SinglePrivateMutable;
mod private_set;
pub use private_set::PrivateSet;
mod single_use_claim;
pub use single_use_claim::SingleUseClaim;

mod public_immutable;
pub use public_immutable::PublicImmutable;
mod public_mutable;
pub use public_mutable::PublicMutable;
mod delayed_public_mutable;
pub use delayed_public_mutable::DelayedPublicMutable;

mod storable;
pub use storable::Storable;
