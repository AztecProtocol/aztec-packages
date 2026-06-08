use crate::protocol::address::AztecAddress;
use crate::state_vars::{
    OwnedStateVariable, RuntimeOwnedStateVariable, RuntimeStateVariable, StateVariable,
};

/// Per-account state variable.
///
/// A wrapper state variable that is to be used with variables that implement the `OwnedStateVariable` trait.
///
/// Example usage:
///
/// ```noir
/// #[storage]
/// struct Storage {
///     balance: Owned<PrivateSet<UintNote>>,
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
/// * `V` - The underlying type that implements `OwnedStateVariable<Context>` (e.g., `PrivateSet`, `PrivateMutable`).
///
pub struct Owned<V> {}

impl<V, Context> StateVariable<Context> for Owned<V>
where
    V: OwnedStateVariable<Context>,
{
    let N: u32 = 1;
    type Runtime = RuntimeOwned<<V as OwnedStateVariable<Context>>::Runtime, Context>;
}

/// Runtime representation of [`Owned`]. Instantiated by the [`#[storage]`](crate::macros::storage::storage) macro;
/// users do not name this type directly except when using
/// [`#[storage_no_init]`](crate::macros::storage::storage_no_init).
///
/// The `V` generic is the _runtime_ value type, i.e. the projection of the declared owned value type's
/// [`Runtime`](crate::state_vars::OwnedStateVariable::Runtime).
pub struct RuntimeOwned<V, Context> {
    pub context: Context,
    storage_slot: Field,
}

impl<V, Context> RuntimeStateVariable<Context> for RuntimeOwned<V, Context> {
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        RuntimeOwned { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<V, Context> RuntimeOwned<V, Context> {
    /// Returns an instance of the underlying owned state variable for a given owner.
    pub fn at(self, owner: AztecAddress) -> V
    where
        V: RuntimeOwnedStateVariable<Context>,
    {
        V::new(self.context, self.storage_slot, owner)
    }
}
