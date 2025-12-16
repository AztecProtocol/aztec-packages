use dep::aztec::{
    macros::notes::note,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct AddressNote {
    address: AztecAddress,
}

impl AddressNote {
    pub fn new(address: AztecAddress) -> Self {
        AddressNote { address }
    }

    pub fn get_address(self) -> AztecAddress {
        self.address
    }
}
