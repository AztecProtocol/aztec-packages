// docs:start:nft_note_struct
use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct NFTNote {
    pub token_id: Field,
}
// docs:end:nft_note_struct
