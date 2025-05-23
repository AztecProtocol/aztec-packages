use dep::aztec::protocol_types::traits::{Deserialize, Serialize};
use std::meta::derive;

#[derive(Serialize, Deserialize)]
pub struct Position {
    collateral: u128,
    static_debt: u128,
    debt: u128,
}
