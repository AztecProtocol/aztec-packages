use crate::{
    context::{PrivateContext, PublicContext, UnconstrainedContext},
    state_vars::storage::Storage,
};
use dep::protocol_types::{
    constants::INITIALIZATION_SLOT_SEPARATOR,
    traits::{Deserialize, Serialize},
};

/// Stores an immutable value in public state which can be read from public, private and unconstrained execution
/// contexts.
// docs:start:public_immutable_struct
pub struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_immutable_struct

impl<T, Context, let N: u32> Storage<T, N> for PublicImmutable<T, Context>
where
    T: Serialize<N> + Deserialize<N>,
{}

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

impl<T, let T_SERIALIZED_LEN: u32> PublicImmutable<T, &mut PublicContext>
where
    T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN>,
{
    // docs:start:public_immutable_struct_write
    pub fn initialize(self, value: T) {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_slot = INITIALIZATION_SLOT_SEPARATOR + self.storage_slot;
        let init_field: Field = self.context.storage_read(initialization_slot);
        assert(init_field == 0, "PublicImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_slot, 0xdead);
        self.context.storage_write(self.storage_slot, value);
    }
    // docs:end:public_immutable_struct_write

    // Note that we don't access the context, but we do call oracles that are only available in public
    // docs:start:public_immutable_struct_read
    pub fn read(self) -> T {
        self.context.storage_read(self.storage_slot)
    }
    // docs:end:public_immutable_struct_read
}

impl<T, let T_SERIALIZED_LEN: u32> PublicImmutable<T, UnconstrainedContext>
where
    T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN>,
{
    pub unconstrained fn read(self) -> T {
        self.context.storage_read(self.storage_slot)
    }
}

impl<T, let T_SERIALIZED_LEN: u32> PublicImmutable<T, &mut PrivateContext>
where
    T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN>,
{
    pub fn read(self) -> T {
        let header = self.context.get_header();
        let mut fields = [0; T_SERIALIZED_LEN];

        for i in 0..fields.len() {
            fields[i] = header.public_storage_historical_read(
                self.storage_slot + i as Field,
                (*self.context).this_address(),
            );
        }
        T::deserialize(fields)
    }
}
