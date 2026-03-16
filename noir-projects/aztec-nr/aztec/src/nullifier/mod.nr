//! Nullifier-related utilities.
//!
//! Nullifiers are one of the key primitives of private state. A nullifier is a `Field` value that is stored in one of
//! the Aztec state trees: the nullifier tree. Only unique values can be inserted into this tree: attempting to create
//! an
//! already existing nullifier (a duplicate nullifier) will result in either the transaction being unprovable, invalid,
//! or reverting, depending on exactly when the duplicate is created.
//!
//! Generally, nullifiers are used to prevent an action from happening more than once, or to more generally 'consume' a
//! resource. This can include preventing re-initialization of contracts, replay attacks of signatures, repeated claims
//! of a deposit, double-spends of received funds, etc. To achieve this, nullifiers must be computed
//! **deterministically** from the resource they're consuming. For example a contract initialization nullifier might
//! use
//! its address, or a signature replay protection could use the signature hash.
//!
//! One of the key properties of nullifiers is that they can be created by private functions, resulting in transactions
//! that do not reveal which actions they've performed. Their computation often involves a **secret parameter**, often
//! derived from a nullifier hiding key (`nhk`) which prevents linking of the resource that was consumed from the
//! nullifier. For example, it is not possible to determine which nullifier corresponds to a given note hash without
//! knowledge of the `nhk`, and so the transactions that created the note and nullifier remain unlinked.
//!
//! In other words, a nullifier is (in most cases) a random-looking but deterministic record of a private, one-time
//! action, which does not leak what action has been taken, and which preserves the property of transaction
//! unlinkability.
//!
//! In some cases, nullifiers cannot be secret as knowledge of them **must** be public information. For example,
//! contracts used by multiple people (like tokens) cannot have secrets in their initialization nullifiers: for users
//! to
//! use the contract they must prove that it has been initialized, and this requires them being able to compute the
//! initialization nullifier.
//!
//! ## Nullifier Creation
//!
//! The low-level mechanisms to create new nullifiers are [`crate::context::PrivateContext::push_nullifier`] and
//! [`crate::context::PublicContext::push_nullifier`], but these require care and can be hard to use correctly.
//! Higher-level abstractions exist which safely create nullifiers, such as [`crate::note::lifecycle::destroy_note`]
//! and
//! [`crate::state_vars::SingleUseClaim`].
//!
//! ## Reading Nullifiers
//!
//! Private functions can prove that nullifiers have been created via
//! [`crate::context::PrivateContext::assert_nullifier_exists`] and
//! [`crate::history::nullifier::assert_nullifier_existed_by`], but the only general mechanism to privately prove that
//! a
//! nullifier _does not_ exist is to create it - which can only be done once.
//!
//! Public functions on the other hand can prove both nullifier existence and non-existence via
//! [`crate::context::PublicContext::nullifier_exists_unsafe`].
pub mod utils;
