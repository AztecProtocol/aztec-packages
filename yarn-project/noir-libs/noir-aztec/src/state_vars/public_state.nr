use crate::oracle::storage::storage_read;
use crate::oracle::storage::storage_write;
use crate::state_vars::type_serde_interface::TypeSerdeInterface;

struct PublicState<T, N> {
    storage_slot: Field,
    serde_interface: TypeSerdeInterface<T, N>,
}

impl<T, N> PublicState<T, N> {
    fn new(storage_slot: Field, serde_interface: TypeSerdeInterface<T, N>) -> Self {
        PublicState { storage_slot, serde_interface }
    }

    fn read(self) -> T {
        storage_read(self.storage_slot, self.serde_interface.deserialise)
    }

    fn write(self, value: T) {
        let serialise = self.serde_interface.serialise;
        let fields = serialise(value);
        storage_write(self.storage_slot, fields);
    }
}