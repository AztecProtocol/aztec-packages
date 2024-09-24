use dep::aztec::{
    note::utils::compute_note_hash_for_nullify, keys::getters::get_nsk_app,
    oracle::unsafe_rand::unsafe_rand, prelude::{NullifiableNote, NoteHeader, PrivateContext},
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator, traits::{Empty, Eq}},
    macros::notes::note
};

#[note]
struct NFTNote {
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for NFTNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        0
    }

    fn compute_nullifier_without_context(self) -> Field {
        0
    }
}
