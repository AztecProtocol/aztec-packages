use aztec::{macros::notes::note, protocol::traits::Packable};

// Mirrors PublicKeyNote in schnorr_account_contract so the stub's auto-generated _compute_note_hash
// can decode the real account's signing_public_key note during simulation sync.
#[derive(Eq, Packable)]
#[note]
pub struct PublicKeyNote {
    pub x: Field,
    pub y: Field,
}
