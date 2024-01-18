use dep::aztec::protocol_types::{
    address::AztecAddress,
    traits::{Serialize, Deserialize},
};

// docs:start:state_vars-CustomStruct
struct Queen {
    account: AztecAddress,
    points: u8,
}
// docs:end:state_vars-CustomStruct

// docs:start:state_vars-PublicStateCustomStruct
global QUEEN_SERIALIZED_LEN: Field = 2;

impl Serialize<QUEEN_SERIALIZED_LEN> for Queen {
    fn serialize(queen: Queen) -> [Field; QUEEN_SERIALIZED_LEN] {
        [queen.account.to_field(), queen.points as Field]
    }
}

impl Deserialize<QUEEN_SERIALIZED_LEN> for Queen {
    fn deserialize(fields: [Field; QUEEN_SERIALIZED_LEN]) -> Queen {
        Queen { account: AztecAddress::from_field(fields[0]), points: fields[1] as u8 }
    }
}
// docs:end:state_vars-PublicStateCustomStruct
