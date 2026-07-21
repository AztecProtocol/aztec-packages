// noir-fmt:ignore
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
//! ## Declaration
//!
//! All of a contract's state variables, both public and private, are declared in a single place: as members of a struct
//! to which the [`#[storage]`](crate::macros::storage::storage) macro is applied.
//!
//! ```noir
//! #[storage]
//! struct Storage<C> {
//!     a: PublicMutable<bool, C>,
//!     b: Map<AztecAddress, DelayedPublicMutable<u128, C>, C>,
//!     c: Owned<PrivateSet<UintNote, C>, C>,
//! }
//! ```
//!
//! ## Choosing a State Variable
//!
//! The very first question to answer is whether the contents of the variable should be _public_ (everyone in the
//! network can see their contents, like Solidity state variables), or _private_ (only some people know what is stored
//! in them).
//!
//! ### Public State Variables
//!
//! Public state variables typically store their contents in the public storage tree, and can therefore only be written
//! to by public contract functions.
//!
//! | State Variable                                                    | Mutable?            | Readable in Private? | Writable in Private? | Example Use Case                                                                   |
//! | ----------------------------------------------------------------- | ------------------- | -------------------- | -------------------- | ---------------------------------------------------------------------------------- |
//! | [`PublicMutable`](crate::state_vars::PublicMutable)               | yes                 | no                   | no                   | Configuration of admins, global state (e.g. token total supply, total votes)       |
//! | [`PublicImmutable`](crate::state_vars::PublicImmutable)           | no                  | yes                  | no                   | Fixed configuration, one-way actions (e.g. initialization settings for a proposal) |
//! | [`DelayedPublicMutable`](crate::state_vars::DelayedPublicMutable) | yes (after a delay) | yes                  | no                   | Non time sensitive system configuration                                            |
//!
//! ### Private State Variables
//!
//! Private state variables typically store their contents in the note and nullifier trees, and are therefore mainly
//! interacted with from private contract functions.
//!
//! | State Variable                                            | Mutable? | Cost to Read? | Writable by Third Parties? | Example Use Case                                                                                               |
//! | --------------------------------------------------------- | -------- | ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
//! | [`PrivateMutable`](crate::state_vars::PrivateMutable)     | yes      | yes           | no                         | Mutable user state only accessible by them (e.g. user settings or keys)                                        |
//! | [`PrivateImmutable`](crate::state_vars::PrivateImmutable) | no       | no            | no                         | Fixed configuration, one-way actions (e.g. initialization settings for a proposal)                             |
//! | [`PrivateSet`](crate::state_vars::PrivateSet)             | yes      | yes           | yes                        | Aggregated state others can add to, e.g. token balance (set of amount notes), NFT collections (set of NFT ids) |
//!
//! ## Storage Slots
//!
//! Each state variable in a contract gets assigned a unique storage slot, which isolates the different variables so
//! that reads and writes to one do not interfere with others.
//!
//! Storage slot allocation is automatic and cannot be overridden. A state variable's storage slot can be queried via
//! [`crate::state_vars::StateVariable::get_storage_slot`].
//!
//! ```noir
//! #[storage]
//! struct Storage<C> {
//!     a: PublicMutable<bool, C>,
//! }
//!
//! #[external("utility")]
//! fn get_a_storage_slot() -> Field {
//!     self.storage.a.get_storage_slot()
//! }
//! ```
//!
//! ## The Context Parameter
//!
//! All state variables take a generic `Context` parameter, which will be set to one of
//! [`PrivateContext`](crate::context::PrivateContext), [`PublicContext`](crate::context::PublicContext) or
//! [`UtilityContext`](crate::context::UtilityContext) depending on the contract function type. This leads to some
//! unfortunate boilerplate when declaring contract storage.
//!
//! Different methods are available depending on the context, reflecting that certain actions can only be performed in
//! some or other context. For example, [`PublicMutable`](crate::state_vars::PublicMutable)'s
//! [`read`](crate::state_vars::PublicMutable::read) function is available under both `PublicContext` and
//! `UtilityContext`, but not `PrivateContext` since `PublicMutable` cannot be read from private functions. Similarly,
//! [`write`](crate::state_vars::PublicMutable::write) is only available in `PublicContext`.
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
//! // Inefficient reads and writes - each bool is assigned a distinct storage slot, so reading or writing both requires
//! // executing `SLOAD` or `SSTORE` twice.
//! #[storage]
//! struct Storage<C> {
//!     a: PublicMutable<bool, C>,
//!     b: PublicMutable<bool, C>,
//! }
//!
//! // By storing the booleans in a single struct and implementing the Packable trait with tight packing, we can instead
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
