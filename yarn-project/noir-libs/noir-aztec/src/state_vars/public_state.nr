use crate::context::{PrivateContext, PublicContext};
use crate::oracle::storage::storage_read;
use crate::oracle::storage::storage_write;
use crate::types::type_serialisation::TypeSerialisationInterface;
use dep::std::option::Option;

struct PublicState<T, T_SERIALISED_LEN> {
    storage_slot: Field,
    serialisation_methods: TypeSerialisationInterface<T, T_SERIALISED_LEN>,
}

impl<T, T_SERIALISED_LEN> PublicState<T, T_SERIALISED_LEN> {
    fn new(
        // Note: passing the contexts to new to have an interface compatible with Map.
        _: Option<&mut PrivateContext>,
        _: Option<&mut PublicContext>,
        storage_slot: Field,
        serialisation_methods: TypeSerialisationInterface<T, T_SERIALISED_LEN>,
    ) -> Self {
        assert(storage_slot != 0); // Storage slot 0 not allowed. Storage slots must start from 1.
        PublicState {
            storage_slot,
            serialisation_methods,
        }
    }

    fn read(self) -> T {
        storage_read(self.storage_slot, self.serialisation_methods.deserialise)
    }

    fn write(self, value: T) {
        let serialise = self.serialisation_methods.serialise;
        let fields = serialise(value);
        storage_write(self.storage_slot, fields);
    }
}
