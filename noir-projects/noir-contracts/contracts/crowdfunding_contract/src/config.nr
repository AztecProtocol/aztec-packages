use dep::aztec::protocol_types::{address::AztecAddress, traits::Packable};
use std::meta::derive;

/// We store the values in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Eq, Packable)]
pub struct Config {
    pub donation_token: AztecAddress, // Token used for donations (e.g. DAI)
    pub operator: AztecAddress, // Crowdfunding campaign operator
    pub deadline: u64, // End of the crowdfunding campaign after which no more donations are accepted
}
