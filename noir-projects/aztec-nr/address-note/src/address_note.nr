use dep::aztec::{
    macros::notes::note,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct AddressNote {
    pub address: AztecAddress,
}
