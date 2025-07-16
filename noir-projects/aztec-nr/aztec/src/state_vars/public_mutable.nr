use crate::context::{PublicContext, UtilityContext};
use crate::state_vars::storage::HasStorageSlot;
use dep::protocol_types::traits::Packable;

mod test;

// docs:start:public_mutable_struct
pub struct PublicMutable<T, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_mutable_struct

impl<T, Context, let N: u32> HasStorageSlot<N> for PublicMutable<T, Context>
where
    T: Packable<N>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicMutable<T, Context> {
    // docs:start:public_mutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicMutable { context, storage_slot }
    }
    // docs:end:public_mutable_struct_new
}

impl<T> PublicMutable<T, &mut PublicContext> {
    // docs:start:public_mutable_struct_read
    pub fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN>,
    {
        self.context.storage_read(self.storage_slot)
    }
    // docs:end:public_mutable_struct_read

    // docs:start:public_mutable_struct_write
    pub fn write<let T_PACKED_LEN: u32>(self, value: T)
    where
        T: Packable<T_PACKED_LEN>,
    {
        self.context.storage_write(self.storage_slot, value);
    }
    // docs:end:public_mutable_struct_write
}

impl<T> PublicMutable<T, UtilityContext> {
    pub unconstrained fn read<let T_PACKED_LEN: u32>(self) -> T
    where
        T: Packable<T_PACKED_LEN>,
    {
        self.context.storage_read(self.storage_slot)
    }
}
