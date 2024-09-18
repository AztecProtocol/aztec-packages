use dep::aztec::{
    prelude::{NullifiableNote, PrivateContext},
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator},
    note::utils::compute_note_hash_for_nullify, keys::getters::get_nsk_app, macros::notes::note
};

#[note]
struct UintNote {
    // The integer stored by the note
    value: U128,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for UintNote {
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
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER
        )
    }
}

impl Eq for UintNote {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value)
            & (self.npk_m_hash == other.npk_m_hash)
            & (self.randomness == other.randomness)
    }
}
