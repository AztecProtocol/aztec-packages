use dep::aztec::state_vars::map::Map;
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::state_vars::public_state_value::field_value::FieldValueInterface;
use dep::aztec::state_vars::public_state_value::field_value::FIELD_VALUE_LEN;

struct Storage {
    balances: Map<PublicState<Field, FIELD_VALUE_LEN>>,
}

fn create_public_state(storage_slot: Field) -> PublicState<Field, FIELD_VALUE_LEN> {
    PublicState::new(storage_slot, FieldValueInterface)
}

impl Storage {
    fn init() -> Self {
        Storage {
            balances: Map::new(1, create_public_state),
        }
    }
}