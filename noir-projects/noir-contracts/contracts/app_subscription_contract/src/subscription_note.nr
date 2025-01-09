use dep::aztec::{
    hash::poseidon2_hash_with_separator,
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    oracle::random::random,
    prelude::{NoteHeader, NullifiableNote, PrivateContext},
    protocol_types::{address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER},
};

#[note]
pub struct SubscriptionNote {
    owner: AztecAddress,
    expiry_block_number: Field,
    remaining_txs: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NullifiableNote for SubscriptionNote {
    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl SubscriptionNote {
    pub fn new(owner: AztecAddress, expiry_block_number: Field, remaining_txs: Field) -> Self {
        let randomness = unsafe {
            //@safety We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
            // so a malicious sender could use non-random values to make the note less private. But they already know
            // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
            // information. We can therefore assume that the sender will cooperate in the random value generation.
            random()
        };
        Self { owner, expiry_block_number, remaining_txs, randomness, header: NoteHeader::empty() }
    }
}
