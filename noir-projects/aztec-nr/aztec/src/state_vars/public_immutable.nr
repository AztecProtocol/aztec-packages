use crate::{context::{PublicContext, UnconstrainedContext}, oracle::storage::storage_read};
use dep::protocol_types::{slots::INITIALIZATION_CONTRACT_STORAGE_INDEX_SEPARATOR, point::Point, traits::{Deserialize, Serialize}};

// Just like SharedImmutable but without the ability to read from private functions.
// docs:start:public_immutable_struct
struct PublicImmutable<T, Context> {
    context: Context,
    contract_storage_index: Field,
}
// docs:end:public_immutable_struct

impl<T, Context> PublicImmutable<T, Context> {
    // docs:start:public_immutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Point
    ) -> Self {
        let contract_storage_index = storage_slot.x;
        PublicImmutable { context, contract_storage_index }
    }
    // docs:end:public_immutable_struct_new
}

impl <T, T_SERIALIZED_LEN> PublicImmutable<T, &mut PublicContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    // docs:start:public_immutable_struct_write
    pub fn initialize(self, value: T) {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_contract_storage_index = INITIALIZATION_CONTRACT_STORAGE_INDEX_SEPARATOR + self.contract_storage_index;
        let init_field: Field = self.context.storage_read(initialization_contract_storage_index);
        assert(init_field == 0, "PublicImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_contract_storage_index, 0xdead);
        self.context.storage_write(self.contract_storage_index, value);
    }
    // docs:end:public_immutable_struct_write

    // Note that we don't access the context, but we do call oracles that are only available in public
    // docs:start:public_immutable_struct_read
    pub fn read(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
    // docs:end:public_immutable_struct_read
}

impl<T, T_SERIALIZED_LEN> PublicImmutable<T, UnconstrainedContext>where T: Deserialize<T_SERIALIZED_LEN> {
    unconstrained pub fn read(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
}
