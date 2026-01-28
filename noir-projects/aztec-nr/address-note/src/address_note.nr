use aztec::{macros::notes::note, protocol::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}}};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct AddressNote {
    pub address: AztecAddress,
}
