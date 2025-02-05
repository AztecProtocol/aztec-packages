use dep::aztec::protocol_types::{address::{AztecAddress, EthAddress}, traits::Packable};
use std::meta::derive;

#[derive(Eq, Packable)]
pub struct Config {
    pub token: AztecAddress,
    pub portal: EthAddress,
}
