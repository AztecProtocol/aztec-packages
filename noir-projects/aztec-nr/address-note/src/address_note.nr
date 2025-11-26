use dep::aztec::{
    macros::notes::note,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct AddressNote {
    address: AztecAddress,
    owner: AztecAddress,
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner: AztecAddress) -> Self {
        AddressNote { address, owner }
    }

    pub fn get_address(self) -> AztecAddress {
        self.address
    }
}
