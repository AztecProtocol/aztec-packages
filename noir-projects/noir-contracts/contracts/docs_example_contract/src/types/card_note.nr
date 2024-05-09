use dep::aztec::prelude::{AztecAddress, NoteInterface, NoteHeader, PrivateContext};
use dep::aztec::{
    note::{utils::compute_note_hash_for_consumption},
    oracle::{nullifier_key::get_nsk_app, get_public_key::get_public_key_with_npk_m_hash},
    hash::poseidon2_hash, protocol_types::{traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER}
};

// Shows how to create a custom note

global CARD_NOTE_LEN: Field = 3;

// docs:start:state_vars-CardNote
#[aztec(note)]
struct CardNote {
    points: u8,
    randomness: Field,
    // The nullifying public key hash of the person who owns the note. 
    // This is used with the app_nullifier_secret_key to ensure that the note can be privately spent.
    npk_m_hash: Field,
}
// docs:end:state_vars-CardNote

impl CardNote {
    pub fn new(points: u8, randomness: Field, npk_m_hash: Field) -> Self {
        CardNote { points, randomness, npk_m_hash, header: NoteHeader::empty() }
    }
}

impl NoteInterface<CARD_NOTE_LEN> for CardNote {
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app(self.npk_m_hash
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        // TODO (#5901): This will be refactored completely when we update the encryped log format
        let encryption_pub_key = get_public_key_with_npk_m_hash(self.npk_m_hash);
        context.emit_encrypted_log(
            (*context).this_address(),
            slot,
            Self::get_note_type_id(),
            encryption_pub_key,
            self.serialize_content(),
        );
    }
}
