use dep::aztec::protocol_types::traits::{Deserialize, Serialize};
use std::meta::derive;

#[derive(Serialize, Deserialize)]
pub struct Position {
    collateral: U128,
    static_debt: U128,
    debt: U128,
}
