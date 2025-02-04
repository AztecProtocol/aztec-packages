use crate::{
    context::{PrivateContext, PublicContext, UnconstrainedContext},
    state_vars::storage::Storage,
    utils::with_hash::WithHash,
};
use dep::protocol_types::{constants::INITIALIZATION_SLOT_SEPARATOR, traits::Packable};

/// Stores an immutable value in public state which can be read from public, private and unconstrained execution
/// contexts.
// docs:start:public_immutable_struct
pub struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_immutable_struct

impl<T, Context, let M: u32, let N: u32> Storage<N> for PublicImmutable<T, Context>
where
    WithHash<T, M>: Packable<N>,
{
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}

impl<T, Context> PublicImmutable<T, Context> {
    // docs:start:public_immutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }
    // docs:end:public_immutable_struct_new
}

impl<T, let T_PACKED_LEN: u32> PublicImmutable<T, &mut PublicContext>
where
    T: Packable<T_PACKED_LEN> + Eq,
{
    // docs:start:public_immutable_struct_write
    pub fn initialize(self, value: T) {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_slot = INITIALIZATION_SLOT_SEPARATOR + self.storage_slot;
        let init_field: Field = self.context.storage_read(initialization_slot);
        assert(init_field == 0, "PublicImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_slot, 0xdead);
        self.context.storage_write(self.storage_slot, WithHash::new(value));
    }
    // docs:end:public_immutable_struct_write

    // Note that we don't access the context, but we do call oracles that are only available in public
    // docs:start:public_immutable_struct_read
    pub fn read(self) -> T {
        WithHash::public_storage_read(*self.context, self.storage_slot)
    }
    // docs:end:public_immutable_struct_read
}

impl<T, let T_PACKED_LEN: u32> PublicImmutable<T, UnconstrainedContext>
where
    T: Packable<T_PACKED_LEN> + Eq,
{
    pub unconstrained fn read(self) -> T {
        WithHash::unconstrained_public_storage_read(self.context, self.storage_slot)
    }
}

impl<T, let T_PACKED_LEN: u32> PublicImmutable<T, &mut PrivateContext>
where
    T: Packable<T_PACKED_LEN> + Eq,
{
    pub fn read(self) -> T {
        WithHash::historical_public_storage_read(
            self.context.get_block_header(),
            self.context.this_address(),
            self.storage_slot,
        )
    }
}
