use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::traits::{Serialize, Deserialize};

struct AztecAddressOption {
    address_option: Option<AztecAddress>
}

impl AztecAddressOption {
    pub fn new(address_option: Option<AztecAddress>) -> Self {
        AztecAddressOption { address_option }
    }

    pub fn unwrap_or(self, default: AztecAddress) -> AztecAddress {
        self.address_option.unwrap_or(default)
    }
}

impl Deserialize<2> for AztecAddressOption {
    fn deserialize(fields: [Field; 2]) -> Self {
        if fields[0] == 0 {
            AztecAddressOption::new(Option::none())
        } else {
            AztecAddressOption::new(Option::some(AztecAddress::from_field(fields[1])))
        }
    }
}

impl Serialize<2> for AztecAddressOption {
    fn serialize(self) -> [Field; 2] {
        if self.address_option.is_some() {
            [1, self.address_option.unwrap().to_field()]
        } else {
            [0, 0]
        }
    }
}
