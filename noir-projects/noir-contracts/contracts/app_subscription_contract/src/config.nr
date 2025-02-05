use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

#[derive(Eq, Packable)]
pub struct Config {
    pub target_address: AztecAddress,
    pub subscription_token_address: AztecAddress,
    pub subscription_recipient_address: AztecAddress,
    pub subscription_price: U128,
    pub fee_juice_limit_per_tx: Field,
}
