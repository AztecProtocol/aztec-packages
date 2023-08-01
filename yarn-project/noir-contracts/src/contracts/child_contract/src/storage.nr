use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::state_vars::type_serde_interface::field_serde_interface::FieldSerdeInterface;
use dep::aztec::state_vars::type_serde_interface::field_serde_interface::FIELD_SERIALISED_LEN;

struct Storage {
    current_value: PublicState<Field, FIELD_SERIALISED_LEN>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            current_value: PublicState::new(1, FieldSerdeInterface),
        }
    }
}