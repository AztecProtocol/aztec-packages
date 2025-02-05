use dep::aztec::protocol_types::{address::AztecAddress, traits::Packable};
use std::meta::derive;

#[derive(Eq, Packable)]
pub struct Config {
    pub donation_token: AztecAddress, // Token used for donations (e.g. DAI)
    pub operator: AztecAddress, // Crowdfunding campaign operator
    pub deadline: u64, // End of the crowdfunding campaign after which no more donations are accepted
}
