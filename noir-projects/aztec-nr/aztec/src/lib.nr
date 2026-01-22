//! The aztec-nr framework for writing Aztec smart contracts.
//!
//! This is the detailed API reference for aztec-nr. It assumes that the reader is a developer familiar with Aztec
//! contracts.
//!
//! # Beginners
//!
//! If you don't know what Aztec is, head to the [Aztec documentation](https://docs.aztec.network).
//!
//! If you don't know what aztec-nr is or how to install it, head to the
//! [aztec-nr documentation](https://docs.aztec.network/developers/docs/aztec-nr).
//!
//! # How to Use This Documentation
//!
//! aztec-nr is split into multiple [modules](index.html#modules), each of which deals with some high-level concept. If
//! you already know which module you're interested in, just navigate to it directly.
//!
//! Here are some frequently used modules:
//!  - [`macros`](crate::macros): the attributes applied to contract functions, such as
//!  [`[#external]`](crate::macros::functions::external) and [`[#initializer]`](crate::macros::functions::initializer),
//!  as well as definition of contract types such as [`[#storage]`](crate::macros::storage::storage) and
//!  [`[#event]`](crate::macros::event::event).
//!  - [`state_vars`](crate::state_vars): types for on-chain storage of contract state, such as
//!  [`PrivateMutable`](crate::state_vars::private_mutable::PrivateMutable),
//!  [`PublicMutable`](crate::state_vars::public_mutable::PublicMutable) and [`Map`](crate::state_vars::map::Map).
//!  - [`test`](crate::test): for writing Aztec tests in Noir using
//!  [`TestEnvironment`](crate::test::helpers::test_environment::TestEnvironment) and [mocks](crate::test::mocks).

pub mod context;
mod contract_self;
pub use contract_self::ContractSelf;
pub mod publish_contract_instance;
pub mod hash;
pub mod history;
pub mod keys;
mod messaging;
pub mod note;
pub mod oracle;
pub mod state_vars;
mod capsules;
pub mod event;
pub mod messages;
pub use dep::protocol_types;
pub mod utils;
pub mod authwit;
pub mod macros;

pub mod test;
