// docs:start:PublicState
use dep::aztec::state_vars::{
    map::Map,
    // highlight-start:PublicState
    public_state::PublicState,  
    type_serialisation::field_serialisation::{
        FieldSerialisationMethods,
        FIELD_SERIALISED_LEN,
    },
    // highlight-end:PublicState
};

struct Storage {
    // highlight-next-line:PublicState
    balances: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            balances: Map::new(1, |slot| PublicState::new(slot, FieldSerialisationMethods)),
        }
    }
}
// docs:end:PublicState