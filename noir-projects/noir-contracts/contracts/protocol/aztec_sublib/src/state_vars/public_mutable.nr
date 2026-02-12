use crate::context::{PublicContext, UtilityContext};
use crate::protocol::traits::Packable;
use crate::state_vars::StateVariable;

/// Mutable public values.
///
/// This is one of the most basic public state variables. It is equivalent to a non-`immutable` non-`constant` Solidity
/// state variable.
pub struct PublicMutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

impl<T, Context, let M: u32> StateVariable<M, Context> for PublicMutable<T, Context>
where
    T: Packable<N = M>,
{
    fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicMutable { context, storage_slot }
    }

    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T> PublicMutable<T, PublicContext> {
    /// Returns the current value.
    pub fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }

    /// Stores a new value.
    pub fn write(self, value: T)
    where
        T: Packable,
    {
        self.context.storage_write(self.storage_slot, value);
    }
}

impl<T> PublicMutable<T, UtilityContext> {
    /// Returns the value at the anchor block.
    pub unconstrained fn read(self) -> T
    where
        T: Packable,
    {
        self.context.storage_read(self.storage_slot)
    }
}
