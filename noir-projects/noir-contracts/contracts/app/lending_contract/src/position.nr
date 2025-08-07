use dep::aztec::protocol_types::traits::{Deserialize, Serialize};
use std::meta::derive;

#[derive(Serialize, Deserialize)]
pub struct Position {
    pub collateral: u128,
    pub static_debt: u128,
    pub debt: u128,
}
