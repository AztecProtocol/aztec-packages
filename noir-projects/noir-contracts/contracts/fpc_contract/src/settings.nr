use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

global SETTINGS_LENGTH: u32 = 2;

pub struct Settings {
    asset: AztecAddress, // The asset the admin accepts
    admin: AztecAddress,
}

impl Serialize<SETTINGS_LENGTH> for Settings {
    fn serialize(self: Self) -> [Field; SETTINGS_LENGTH] {
        [self.asset.to_field(), self.admin.to_field()]
    }
}

impl Deserialize<SETTINGS_LENGTH> for Settings {
    fn deserialize(fields: [Field; SETTINGS_LENGTH]) -> Self {
        Settings {
            asset: AztecAddress::from_field(fields[0]),
            admin: AztecAddress::from_field(fields[1]),
        }
    }
}
