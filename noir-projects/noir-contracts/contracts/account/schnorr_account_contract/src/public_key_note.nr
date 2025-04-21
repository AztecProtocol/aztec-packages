use aztec::{macros::notes::note, protocol_types::address::AztecAddress};

// Stores a public key composed of two fields
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[note]
#[derive(Eq)]
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
