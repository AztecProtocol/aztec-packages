use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

// Shows how to create a custom struct in Public
pub struct Leader {
    account: AztecAddress,
    points: u8,
}

global LEADER_SERIALIZED_LEN: u32 = 2;

impl Deserialize<LEADER_SERIALIZED_LEN> for Leader {
    fn deserialize(fields: [Field; LEADER_SERIALIZED_LEN]) -> Self {
        Leader { account: AztecAddress::from_field(fields[0]), points: fields[1] as u8 }
    }
}

impl Serialize<LEADER_SERIALIZED_LEN> for Leader {
    fn serialize(self) -> [Field; LEADER_SERIALIZED_LEN] {
        [self.account.to_field(), self.points as Field]
    }
}
