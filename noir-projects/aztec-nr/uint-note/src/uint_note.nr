use dep::aztec::{
    keys::getters::get_nsk_app,
    macros::notes::partial_note,
    note::utils::compute_note_hash_for_nullify,
    oracle::random::random,
    prelude::{NoteHeader, NullifiableNote, PrivateContext},
    protocol_types::{
        constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator,
    },
};

// docs:start:UintNote
#[partial_note(quote {value})]
pub struct UintNote {
    // The amount of tokens in the note
    value: U128,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}
// docs:end:UintNote

impl NullifiableNote for UintNote {
    // docs:start:nullifier
    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
    // docs:end:nullifier

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER,
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

impl UintNote {
    pub fn new(value: U128, owner_npk_m_hash: Field) -> Self {
        // We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
        // malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        Self { value, npk_m_hash: owner_npk_m_hash, randomness, header: NoteHeader::empty() }
    }

    pub fn get_value(self) -> U128 {
        self.value
    }
}
