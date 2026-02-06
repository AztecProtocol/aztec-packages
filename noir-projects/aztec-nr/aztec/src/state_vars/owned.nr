use crate::protocol::address::AztecAddress;
use crate::state_vars::{OwnedStateVariable, StateVariable};

/// Per-account state variable.
///
/// A wrapper state variable that is to be used with variables that implement the `OwnedStateVariable` trait.
///
/// Example usage:
///
/// ```noir
/// #[storage]
/// struct Storage {
///     balance: Owned<PrivateSet<UintNote, CONTEXT>, CONTEXT>,
/// }
/// ```
///
/// To access the underlying owned state variable for a specific owner, use the `at` method:
///
/// ```noir
/// let user_balance = storage.balance.at(user_address);
/// ```
///
/// For more information on ownership, see the documentation for the `OwnedStateVariable` trait.
///
/// # Type Parameters
///
/// * `V` - The underlying type that implements `OwnedStateVariable<CONTEXT>` (e.g., `PrivateSet`, `PrivateMutable`).
/// * `CONTEXT` - The execution context type (e.g., `PublicContext`, `PrivateContext`, `UtilityContext`). The context
/// determines which methods of the state variable are available.
///
pub struct Owned<V, CONTEXT> {
    pub context: CONTEXT,
    storage_slot: Field,
}

impl<V, CONTEXT> StateVariable<1, CONTEXT> for Owned<V, CONTEXT> {
    fn new(context: CONTEXT, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Owned { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<V, CONTEXT> Owned<V, CONTEXT> {
    /// Returns an instance of the underlying owned state variable for a given owner.
    pub fn at(self, owner: AztecAddress) -> V
    where
        V: OwnedStateVariable<CONTEXT>,
    {
        V::new(self.context, self.storage_slot, owner)
    }
}
