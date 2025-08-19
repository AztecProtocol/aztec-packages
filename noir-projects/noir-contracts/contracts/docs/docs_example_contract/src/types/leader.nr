use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

// Shows how to create a custom struct in Public
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Leader {
    pub account: AztecAddress,
    pub points: u8,
}
