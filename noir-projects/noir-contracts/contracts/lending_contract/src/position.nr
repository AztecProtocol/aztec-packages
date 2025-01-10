use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

pub struct Position {
    collateral: U128,
    static_debt: U128,
    debt: U128,
}

global POSITION_SERIALIZED_LEN: u32 = 3;

// TODO(benesjan): either don't call to_field below or make this Packable trait instead.
impl Serialize<POSITION_SERIALIZED_LEN> for Position {
    fn serialize(position: Position) -> [Field; POSITION_SERIALIZED_LEN] {
        [position.collateral.to_field(), position.static_debt.to_field(), position.debt.to_field()]
    }
}

impl Deserialize<POSITION_SERIALIZED_LEN> for Position {
    fn deserialize(fields: [Field; POSITION_SERIALIZED_LEN]) -> Position {
        Position {
            collateral: U128::from_integer(fields[0]),
            static_debt: U128::from_integer(fields[1]),
            debt: U128::from_integer(fields[2]),
        }
    }
}
