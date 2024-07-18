use dep::aztec::{
    keys::PublicKeys, state_vars::{PublicMutable, Map},
    protocol_types::{point::Point, address::{AztecAddress, PartialAddress}}
};

use crate::context::{PublicContext, UnconstrainedContext};
use crate::oracle::storage::storage_read;
use dep::protocol_types::traits::{Deserialize, Serialize};
use crate::state_vars::storage::Storage;

struct PublicMutable<T, Context> {
    context: Context,
    storage_slot: Field,
}

impl<T, Context> Storage<T> for PublicMutable<T, Context> {}

impl<T, Context> PublicMutable<T, Context> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        PublicMutable { context, storage_slot }
    }
}

impl<T, T_SERIALIZED_LEN> PublicMutable<T, &mut PublicContext> where T: Serialize<T_SERIALIZED_LEN> + Deserialize<T_SERIALIZED_LEN> {
    pub fn read(self) -> T {
        self.context.storage_read(self.storage_slot)
    }

    pub fn write(self, value: T) {
        self.context.storage_write(self.storage_slot, value);
    }
}

impl<T, T_SERIALIZED_LEN> PublicMutable<T, UnconstrainedContext> where T: Deserialize<T_SERIALIZED_LEN> {
    unconstrained pub fn read(self) -> T {
        self.context.storage_read(self.storage_slot)
    }
}
