// docs:start:state_vars-PublicState
use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialisation::bool_serialisation::{
    BoolSerialisationMethods,
    BOOL_SERIALISED_LEN,
};

fn init(storage_slot: Field) -> PublicState<bool, BOOL_SERIALISED_LEN> {
    PublicState::new(storage_slot, BoolSerialisationMethods)
}
// docs:end:state_vars-PublicState