use crate::{
    context::{PublicContext, UnconstrainedContext}, oracle::{storage::{storage_read, storage_write}},
    state_vars::storage::Storage
};
use dep::protocol_types::{constants::INITIALIZATION_SLOT_SEPARATOR, traits::{Deserialize, Serialize}};

mod test;

// Just like SharedImmutable but without the ability to read from private functions.
// docs:start:public_immutable_struct
struct PublicImmutable<T, Context> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_immutable_struct

impl<T, Context> Storage<T> for PublicImmutable<T, Context> {}

impl<T, Context> PublicImmutable<T, Context> {
    // docs:start:public_immutable_struct_new
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }
    // docs:end:public_immutable_struct_new

    fn get_initialization_slot(self) -> Field {
        INITIALIZATION_SLOT_SEPARATOR + self.storage_slot
    }
}

impl <T> PublicImmutable<T, &mut PublicContext> {
    // docs:start:public_immutable_struct_write
    pub fn initialize<T_SERIALIZED_LEN>(self, value: T) where T: Serialize<T_SERIALIZED_LEN> {
        assert(!self.is_initialized(), "PublicImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        public_storage::write(self.get_initialization_slot(), 0xdead);

        // And we then store the actual value
        public_storage::write(self.storage_slot, value);
    }
    // docs:end:public_immutable_struct_write

    // Note that we don't access the context, but we do call oracles that are only available in public
    // docs:start:public_immutable_struct_read
    pub fn read<T_SERIALIZED_LEN>(self) -> T where T: Deserialize<T_SERIALIZED_LEN> {
        assert(self.is_initialized(), "PublicImmutable not initialized");
        public_storage::read(self.storage_slot)
    }
    // docs:end:public_immutable_struct_read

    pub fn is_initialized(self) -> bool {
        let init_slot_contents: Field = public_storage::read(self.get_initialization_slot());
        init_slot_contents != 0
    }
}

impl<T> PublicImmutable<T, UnconstrainedContext> {
    pub fn read<T_SERIALIZED_LEN>(self) -> T where T: Deserialize<T_SERIALIZED_LEN> {
        // This looks the same as the &mut PublicContext impl, but is actually very different. In public execution the
        // storage read oracle gets transpiled to SLOAD opcodes, whereas in unconstrained execution the PXE returns
        // historical data.
        let fields = storage_read(self.storage_slot);
        T::deserialize(fields)
    }
}
