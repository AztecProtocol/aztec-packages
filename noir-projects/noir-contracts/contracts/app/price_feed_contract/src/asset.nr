use ::aztec::protocol::traits::{Deserialize, Packable, Serialize};
use std::meta::derive;

#[derive(Deserialize, Packable, Serialize)]
pub struct Asset {
    pub price: u128,
}
