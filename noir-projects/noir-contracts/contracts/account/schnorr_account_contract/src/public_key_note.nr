use aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Packable}};

#[derive(Eq, Packable)]
#[note]
pub struct PublicKeyNote {
    x: Field,
    y: Field,
    owner: AztecAddress,
}

impl PublicKeyNote {
    pub fn new(x: Field, y: Field, owner: AztecAddress) -> Self {
        PublicKeyNote { x, y, owner }
    }
}
