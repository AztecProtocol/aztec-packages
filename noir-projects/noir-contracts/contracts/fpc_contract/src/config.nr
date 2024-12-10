use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

global CONFIG_LENGTH: u32 = 2;

pub struct Config {
    pub accepted_asset: AztecAddress, // Asset the FPC accepts
    pub fee_recipient: AztecAddress, // Address to which the accepted asset is sent
}

impl Serialize<CONFIG_LENGTH> for Config {
    fn serialize(self: Self) -> [Field; CONFIG_LENGTH] {
        [self.accepted_asset.to_field(), self.fee_recipient.to_field()]
    }
}

impl Deserialize<CONFIG_LENGTH> for Config {
    fn deserialize(fields: [Field; CONFIG_LENGTH]) -> Self {
        Config {
            accepted_asset: AztecAddress::from_field(fields[0]),
            fee_recipient: AztecAddress::from_field(fields[1]),
        }
    }
}
