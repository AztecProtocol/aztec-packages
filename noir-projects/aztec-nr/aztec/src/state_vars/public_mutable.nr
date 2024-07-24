use crate::context::{PublicContext, UnconstrainedContext};
use crate::oracle::storage::storage_read;
use dep::protocol_types::{point::Point, traits::{Deserialize, Serialize}};

// docs:start:public_mutable_struct
struct PublicMutable<T, Context> {
    context: Context,
    contract_storage_index: Field,
}
// docs:end:public_mutable_struct

impl<T, Context> PublicMutable<T, Context> {
    // docs:start:public_mutable_struct_new
    pub fn new(
        // Note: Passing the contexts to new(...) just to have an interface compatible with a Map.
        context: Context,
        storage_slot: Point
    ) -> Self {
        let contract_storage_index = storage_slot.x;
        PublicMutable { context, contract_storage_index }
    }
    // docs:end:public_mutable_struct_new
}

impl<T, T_SERIALIZED_LEN> PublicMutable<T, &mut PublicContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    // docs:start:public_mutable_struct_read
    pub fn read(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
    // docs:end:public_mutable_struct_read

    // docs:start:public_mutable_struct_write
    pub fn write(self, value: T) {
        self.context.storage_write(self.contract_storage_index, value);
    }
    // docs:end:public_mutable_struct_write
}

impl<T, T_SERIALIZED_LEN> PublicMutable<T, UnconstrainedContext> where T: Deserialize<T_SERIALIZED_LEN> {
    unconstrained pub fn read(self) -> T {
        self.context.storage_read(self.contract_storage_index)
    }
}
