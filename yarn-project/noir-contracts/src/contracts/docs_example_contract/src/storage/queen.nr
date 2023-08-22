use dep::aztec::state_vars::public_state::PublicState;
use dep::aztec::types::type_serialisation::TypeSerialisationInterface;

use crate::types::queen::Queen;

// docs:start:state_vars-PublicStateCustomStruct
global QUEEN_SERIALISED_LEN: Field = 2;

fn deserialise(fields: [Field; QUEEN_SERIALISED_LEN]) -> Queen {
    Queen {
        account: fields[0],
        points: fields[1] as u8,
    }
}

fn serialise(queen: Queen) -> [Field; QUEEN_SERIALISED_LEN] {
    [queen.account, queen.points as Field]
}

global QueenSerialisationMethods = TypeSerialisationInterface {
    deserialise,
    serialise,
};

fn init(storage_slot: Field) -> PublicState<Queen, QUEEN_SERIALISED_LEN> {
    // highlight-next-line:state_vars-PublicStateCustomStruct
    PublicState::new(storage_slot, QueenSerialisationMethods)
}
// docs:end:state_vars-PublicStateCustomStruct