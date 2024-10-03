use dep::aztec::{
    hash::poseidon2_hash_with_separator, note::utils::compute_note_hash_for_nullify,
    keys::getters::get_nsk_app, oracle::random::random,
    prelude::{PrivateContext, NoteHeader, NullifiableNote},
    protocol_types::constants::GENERATOR_INDEX__NOTE_NULLIFIER, macros::notes::note
};

#[note]
pub struct SubscriptionNote {
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    expiry_block_number: Field,
    remaining_txs: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for SubscriptionNote {
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

    unconstrained fn compute_nullifier_without_context(self) -> Field {
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

impl SubscriptionNote {
    pub fn new(npk_m_hash: Field, expiry_block_number: Field, remaining_txs: Field) -> Self {
        // We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
        // malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe {
            random()
        };
        Self { npk_m_hash, expiry_block_number, remaining_txs, randomness, header: NoteHeader::empty() }
    }
}
