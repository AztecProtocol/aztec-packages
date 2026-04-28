//! Storage for contract state.
//!
//! Contracts store their state in _state variables_. In Solidity, a state variable is simply any value declared inside
//! a contract, e.g. `contract Token { uint256 totalSupply; }`, and they can be one of many kinds (primitive values,
//! mappings, arrays, immutable, etc.).
//!
//! Due to Aztec contracts being able to store both public and private state, there are many more different types of
//! state variables, each with their nuance and use cases. Understanding these is key to understanding how a contract
//! works.
//!
//! ## Packing for Efficient Access
//!
//! Because all state variables are fully independent, when a contract reads or writes one of them all others are left
//! untouched. This is good for isolation, but in some cases users may want to group variables together for more
//! efficient access, for example to access multiple values in a single storage read or write.
//!
//! The pattern to follow is to **group related values in a `struct`**, just like in Solidity. How values are packed
//! inside this `struct` is governed by the [`crate::protocol::traits::Packable`] trait, which must be `#[derive]`'d or
//! manually implemented - see the [`Packable`](crate::protocol::traits::Packable)'s docs on how to do this.
//!
//! ```noir
//! // Inefficient reads and writes - each bool is assigned a distinct storage slot, so reading or writing both
//! requires
//! // executing `SLOAD` or `SSTORE` twice.
//! #[storage]
//! struct Storage<C> {
//!     a: PublicMutable<bool, C>,
//!     b: PublicMutable<bool, C>,
//! }
//!
//! // By storing the booleans in a single struct and implementing the Packable trait with tight packing, we can now
//! // read and write both values in a single `SLOAD` or `SSTORE` opcode.
//! struct TwoBooleans {
//!     a: bool,
//!     b: bool,
//! }
//!
//! impl aztec::protocol::traits::Packable for TwoBooleans {
//!     let N: u32 = 1;
//!
//!     fn pack(self) -> [Field; Self::N] {
//!         [(self.a as Field) * 2.pow_32(1) + (self.b as Field)]
//!     }
//!
//!     fn unpack(packed: [Field; Self::N]) -> Self {
//!         let b = (packed[0] as u8) % 2 != 0;
//!         let a = ((packed[0] - b as Field) / 2.pow_32(1)) != 0;
//!
//!         Self { a, b }
//!     }
//! }
//!
//! #[storage]
//! struct Storage<C> {
//!     a_and_b: PublicMutable<TwoBooleans, C>,
//! }
//! ```
//!
//! Note that private state variables and public ones that can be read from private (like
//! [`PublicImmutable`](crate::state_vars::PublicImmutable) and
//! [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable)) benefit from packing multiple values in the same
//! `struct` even if there is no need for tight packing (e.g. if all values are `Field`s), since they often work by
//! reading the _hash_ of the entire value. Many values in the same `struct` will result in a single hash, and
//! therefore
//! a single read.

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
