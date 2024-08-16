use crate::{
    context::{PrivateContext, PublicContext, UnconstrainedContext}, oracle::storage::storage_read,
    state_vars::storage::Storage
};
use dep::protocol_types::{address::AztecAddress, constants::INITIALIZATION_SLOT_SEPARATOR, traits::{Deserialize, Serialize}};

// Just like PublicImmutable but with the ability to read from private functions.
struct SharedImmutablePacked<T, Context>{
    context: Context,
    storage_slot: Field,
}

impl<T, Context> Storage<T> for SharedImmutablePacked<T, Context> {}

impl<T, Context> SharedImmutablePacked<T, Context> {
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { context, storage_slot }
    }
}

impl<T, let T_SERIALIZED_LEN: u32> SharedImmutablePacked<T, &mut PublicContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    // Intended to be only called once. 
    pub fn initialize(self, value: T) {
        // We check that the struct is not yet initialized by checking if the initialization slot is 0
        let initialization_slot = INITIALIZATION_SLOT_SEPARATOR + self.storage_slot;
        let init_field: Field = self.context.storage_read(initialization_slot);
        assert(init_field == 0, "SharedImmutablePacked already initialized");

        // We populate the initialization slot with a non-zero value to indicate that the struct is initialized
        self.context.storage_write(initialization_slot, 0xdead);

        let serialized = value.serialize();

        let mut packed_serialized: [Field; T_SERIALIZED_LEN + 1] = std::unsafe::zeroed();
        for i in 0..T_SERIALIZED_LEN {
            packed_serialized[i] = serialized[i];
        }
        packed_serialized[T_SERIALIZED_LEN] = std::hash::pedersen_hash(serialized);

        self.context.raw_storage_write(self.storage_slot, packed_serialized);
    }

    pub fn read_public(self) -> T {
        self.context.storage_read(self.storage_slot)
    }
}

impl<T, T_SERIALIZED_LEN> SharedImmutablePacked<T, UnconstrainedContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    unconstrained pub fn read_public(self) -> T {
        self.context.storage_read(self.storage_slot)
    }
}

impl<T, let T_SERIALIZED_LEN: u32> SharedImmutablePacked<T, &mut PrivateContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    pub fn read_private(self) -> T {
        let contract_address = (*self.context).this_address();

        let header = self.context.get_header();

        let hash = header.public_storage_historical_read(
            (self.storage_slot as u32 + T_SERIALIZED_LEN) as Field,
            contract_address
        );

        let value: [Field; T_SERIALIZED_LEN] = get_hint(contract_address, self.storage_slot);

        assert(hash == std::hash::pedersen_hash(value), "Hash mismatch");

        T::deserialize(value)
    }
}

unconstrained fn get_hint<let T_SERIALIZED_LEN: u32>(
    contract_address: AztecAddress,
    storage_slot: Field
) -> [Field; T_SERIALIZED_LEN] {
    let context: UnconstrainedContext = UnconstrainedContext::at(contract_address);
    context.raw_storage_read(storage_slot)
}
