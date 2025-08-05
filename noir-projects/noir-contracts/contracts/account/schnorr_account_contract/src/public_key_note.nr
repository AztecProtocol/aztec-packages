use aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Packable}};

// Stores a public key composed of two fields
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[derive(Eq, Packable)]
#[note]
pub struct PublicKeyNote {
    pub x: Field,
    pub y: Field,
    pub owner: AztecAddress,
}

impl PublicKeyNote {
    pub fn new(x: Field, y: Field, owner: AztecAddress) -> Self {
        PublicKeyNote { x, y, owner }
    }
}
