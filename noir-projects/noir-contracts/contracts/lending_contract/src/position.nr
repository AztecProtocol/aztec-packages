use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

pub struct Position {
    collateral: U128,
    static_debt: U128,
    debt: U128,
}

global POSITION_SERIALIZED_LEN: u32 = 6;

impl Serialize<POSITION_SERIALIZED_LEN> for Position {
    fn serialize(position: Position) -> [Field; POSITION_SERIALIZED_LEN] {
        let serialized_collateral = position.collateral.serialize();
        let serialized_static_debt = position.static_debt.serialize();
        let serialized_debt = position.debt.serialize();
        [
            serialized_collateral[0],
            serialized_collateral[1],
            serialized_static_debt[0],
            serialized_static_debt[1],
            serialized_debt[0],
            serialized_debt[1],
        ]
    }
}

impl Deserialize<POSITION_SERIALIZED_LEN> for Position {
    fn deserialize(fields: [Field; POSITION_SERIALIZED_LEN]) -> Position {
        Position {
            collateral: U128::deserialize([fields[0], fields[1]]),
            static_debt: U128::deserialize([fields[2], fields[3]]),
            debt: U128::deserialize([fields[4], fields[5]]),
        }
    }
}
