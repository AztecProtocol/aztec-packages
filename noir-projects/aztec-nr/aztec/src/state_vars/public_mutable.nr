use crate::context::{PublicContext, UtilityContext};
use crate::state_vars::storage::HasStorageSlot;
use dep::protocol_types::traits::Packable;

/// # PublicMutable
///
/// PublicMutable is a public state variable type for values that can be read
/// and written within #[public] functions of your smart contract.
///
/// You can declare a state variable of type PublicMutable within your contract's
/// #[storage] struct:
///
/// E.g.:
/// `your_variable: PublicMutable<T, Context>`
/// or:
/// `your_mapping: Map<Field, PublicMutable<T, Context>>`
///
/// The methods of PublicMutable are:
/// - `read`
/// - `write`
/// (see the methods' own doc comments for more info).
///
/// ## Example.
///
/// A voting contract's proposal count can be represented as a PublicMutable<u64>.
/// The count can be read by anyone to see how many proposals exist, and incremented
/// when new proposals are submitted.
///
/// # Generic Parameters:
///
/// * `T` - The type of value stored (must implement Packable).
/// * `Context` - The execution context (PublicContext or UtilityContext).
///
/// # Advanced
///
/// Unlike private state variables which use notes, PublicMutable stores values
/// directly in Aztec's public data tree. This enables direct read and write
/// access to the current state during public function execution.
///
/// docs:start:public_mutable_struct
pub struct PublicMutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

impl<T, Context, let M: u32> HasStorageSlot<M> for PublicMutable<T, Context>
where
    T: Packable<N = M>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicMutable<T, Context> {
    /// Initializes a new PublicMutable state variable.
    ///
    /// This function is usually automatically called within the #[storage] macro.
    /// You typically don't need to call this directly when writing smart contracts.
    ///
    /// # Arguments
    ///
    /// * `context` - One of `PublicContext`/`UtilityContext`. The Context determines
    ///               which methods of this struct will be made available to the calling
    ///               smart contract function.
    /// * `storage_slot` - A unique identifier for this state variable within the
    ///                    contract. Usually, the #[storage] macro will determine an
    ///                    appropriate storage_slot automatically. A smart contract
    ///                    dev shouldn't have to worry about this, as it's managed
    ///                    behind the scenes.
    ///
    /// docs:start:public_mutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicMutable { context, storage_slot }
    }
}

impl<T> PublicMutable<T, &mut PublicContext> {
    /// Reads the current value stored in this PublicMutable state variable.
    ///
    /// # Returns
    ///
    /// * `T` - The current value stored in this PublicMutable.
    ///
    /// docs:start:public_mutable_struct_read
    pub fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }

    /// Writes a new value to this PublicMutable state variable.
    ///
    /// # Arguments
    ///
    /// * `value` - The new value to store in this PublicMutable.
    ///
    /// # Advanced
    ///
    /// This function updates the value stored in Aztec's public data tree.
    /// The new value becomes immediately available to subsequent reads within
    /// the same transaction.
    ///
    /// docs:start:public_mutable_struct_write
    pub fn write(self, value: T)
    where
        T: Packable,
    {
        self.context.storage_write(self.storage_slot, value);
    }
}

impl<T> PublicMutable<T, UtilityContext> {
    /// Reads the current value stored in this PublicMutable state variable.
    ///
    /// Notice that this function is executable only within a UtilityContext, which
    /// is an unconstrained environment on the user's local device.
    ///
    /// # Returns
    ///
    /// * `T` - The current value stored in this PublicMutable.
    ///
    pub unconstrained fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }
}
