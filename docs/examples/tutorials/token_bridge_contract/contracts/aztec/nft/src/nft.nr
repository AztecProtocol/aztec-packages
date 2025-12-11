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
    pub token_id: Field,
}
// docs:end:nft_note_struct
