use crate::protocol::address::AztecAddress;

/// A trait that defines the interface for Aztec state variables that have an owner. Unlike regular state variables,
/// owned state variables need to be wrapped in `Owned` state variable when placed in storage:
///
/// ```noir
/// #[storage]
/// struct Storage {
///     balance: Owned<PrivateSet<UintNote, Context>, Context>,
/// }
/// ```
///
/// Owned state variables are only used when working with private data because, in the public context, write
/// permissions are solely defined by the contract logic, and anyone can read data. In private, however, modifying
/// state (nullifying private notes) requires both knowledge of the note (the note commitment preimage) and possession
/// of the corresponding nullifier hiding key.
///
/// ## So what is an Owner?
///
/// An **owner** is generally the entity that:
/// 1. Can decrypt the message in which the given note pertaining to the state variable was sent,
/// 2. has the ability to nullify (spend/destroy) those notes.
///
/// (Note that point 1 does not necessarily have to be true; for example, the note message could be encrypted for a
/// decrypting service address, which could then deliver the note to the actual owner via offchain communication.)
///
/// # Type Parameters
///
/// * `Context` - The execution context type (e.g., `PublicContext`, `PrivateContext`, `UtilityContext`). The context
/// determines which methods of the state variable are available and controls whether the variable can be accessed in
/// public, private or utility functions.
///
pub trait OwnedStateVariable<Context> {
    /// Initializes a new owned state variable with a given storage slot and owner. The storage slot is inherited from
    /// the `Owned` state variable unchanged. The `Owned` state variable calls this function when its `at` method is
    /// invoked.
    fn new(context: Context, storage_slot: Field, owner: AztecAddress) -> Self;
}
