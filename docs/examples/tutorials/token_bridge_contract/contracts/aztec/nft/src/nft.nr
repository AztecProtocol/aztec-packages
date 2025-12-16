// docs:start:nft_note_struct
use dep::aztec::{
    macros::notes::note,
    protocol_types::{
        address::AztecAddress,
        traits::Packable,
    },
    oracle::random::random,
};

#[derive(Eq, Packable)]
#[note]
pub struct NFTNote {
    token_id: Field,
}
// docs:end:nft_note_struct

// docs:start:nft_note_new
impl NFTNote {
    pub fn new(token_id: Field) -> Self {
        NFTNote { token_id }
    }
}
// docs:end:nft_note_new
