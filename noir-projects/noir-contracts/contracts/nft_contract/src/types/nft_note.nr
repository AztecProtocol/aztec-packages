use dep::aztec::{
    note::utils::compute_note_hash_for_nullify, keys::getters::get_nsk_app,
    oracle::unsafe_rand::unsafe_rand, prelude::{NullifiableNote, NoteHeader, PrivateContext},
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator, traits::{Empty, Eq}},
    macros::notes::partial_note
};

#[partial_note(quote { token_id})]
struct NFTNote {
    // ID of the token
    token_id: Field,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for NFTNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }
}

impl NFTNote {
    pub fn new(token_id: Field, npk_m_hash: Field) -> Self {
        let randomness = unsafe {
            unsafe_rand()
        };
        NFTNote { token_id, npk_m_hash, randomness, header: NoteHeader::empty() }
    }
}

impl Eq for NFTNote {
    fn eq(self, other: Self) -> bool {
        (self.token_id == other.token_id)
            & (self.npk_m_hash == other.npk_m_hash)
            & (self.randomness == other.randomness)
    }
}
