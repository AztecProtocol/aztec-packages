use crate::context::{Context};
use crate::oracle::storage::storage_read;
use crate::oracle::storage::storage_write;
use dep::std::option::Option;
use dep::protocol_types::traits::{Deserialize, Serialize};

// docs:start:public_state_struct
struct PublicState<T, T_SERIALIZED_LEN> {
    context: Context,
    storage_slot: Field,
}
// docs:end:public_state_struct

impl<T, T_SERIALIZED_LEN> PublicState<T, T_SERIALIZED_LEN> {
    // docs:start:public_state_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Field,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicState {
            context,
            storage_slot,
        }
    }
    // docs:end:public_state_struct_new

    // docs:start:public_state_struct_read
    pub fn read(self) -> T where T: Deserialize<T_SERIALIZED_LEN> {
        assert(self.context.private.is_none(), "Public state writes only supported in public functions");
        // TODO: Strong typing required because of https://github.com/noir-lang/noir/issues/4088
        let fields: [Field; T_SERIALIZED_LEN] = storage_read(self.storage_slot);
        T::deserialize(fields)
    }
    // docs:end:public_state_struct_read

    // docs:start:public_state_struct_write
    pub fn write(self, value: T) where T: Serialize<T_SERIALIZED_LEN> {
        assert(self.context.private.is_none(), "Public state writes only supported in public functions");
        // TODO: Strong typing required because of https://github.com/noir-lang/noir/issues/4088
        let fields: [Field; T_SERIALIZED_LEN] = T::serialize(value);
        storage_write(self.storage_slot, fields);
    }
    // docs:end:public_state_struct_write
}
