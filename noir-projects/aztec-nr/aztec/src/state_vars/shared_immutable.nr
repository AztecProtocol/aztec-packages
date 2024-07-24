use crate::{context::{PrivateContext, PublicContext, UnconstrainedContext}, oracle::storage::storage_read};
use dep::protocol_types::{slots::INITIALIZATION_CONTRACT_STORAGE_INDEX_SEPARATOR, point::Point, traits::{Deserialize, Serialize}};

// Just like PublicImmutable but with the ability to read from private functions.
struct SharedImmutable<T, Context>{
    context: Context,
    contract_storage_index: Field,
}

impl<T, Context> SharedImmutable<T, Context> {
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Point
    ) -> Self {
        let contract_storage_index = storage_slot.x;
        Self { context, contract_storage_index }
    }
}

impl<T, T_SERIALIZED_LEN> SharedImmutable<T, &mut PublicContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    // Intended to be only called once. 
    pub fn initialize(self, value: T) {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_contract_storage_index = INITIALIZATION_CONTRACT_STORAGE_INDEX_SEPARATOR + self.contract_storage_index;
        let init_field: Field = self.context.storage_read(initialization_contract_storage_index);
        assert(init_field == 0, "SharedImmutable already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_contract_storage_index, 0xdead);
        self.context.storage_write(self.contract_storage_index, value);
    }

    pub fn read_public(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
}

impl<T, T_SERIALIZED_LEN> SharedImmutable<T, UnconstrainedContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    unconstrained pub fn read_public(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
}

impl<T, T_SERIALIZED_LEN> SharedImmutable<T, &mut PrivateContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    pub fn read_private(self) -> T {
        let header = self.context.get_header();
        let mut fields = [0; T_SERIALIZED_LEN];

        for i in 0..fields.len() {
            fields[i] =
                header.public_storage_historical_read(
                    self.contract_storage_index + i as Field,
                    (*self.context).this_address()
                );
        }
        T::deserialize(fields)
    }
}
