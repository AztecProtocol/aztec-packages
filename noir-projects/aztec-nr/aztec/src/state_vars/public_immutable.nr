use crate::context::{Context};
use crate::oracle::storage::storage_read;
use crate::oracle::storage::storage_write;
use dep::std::option::Option;
use dep::protocol_types::traits::{Deserialize, Serialize};
use crate::state_vars::storage::Storage;

// docs:start:public_immutable_struct
struct PublicImmutable<T> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_immutable_struct

impl<T> Storage<T> for PublicImmutable<T> {}

impl<T> PublicImmutable<T> {
    // docs:start:public_immutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicImmutable { context, storage_slot }
    }
    // docs:end:public_immutable_struct_new

    // docs:start:public_immutable_struct_write
    pub fn initialize<T_SERIALIZED_LEN>(self, value: T) where T: Serialize<T_SERIALIZED_LEN> {
        assert(
            self.context.private.is_none(), "PublicImmutable initialization only supported in public functions"
        );
        let fields = T::serialize(value);
        storage_write(self.storage_slot, fields);
    }
    // docs:end:public_immutable_struct_write

    // docs:start:public_immutable_struct_read
    pub fn read<T_SERIALIZED_LEN>(self) -> T where T: Deserialize<T_SERIALIZED_LEN> {
        assert(self.context.private.is_none(), "PublicImmutable reads only supported in public functions");
        let fields = storage_read(self.storage_slot);
        T::deserialize(fields)
    }
    // docs:end:public_immutable_struct_read
}
