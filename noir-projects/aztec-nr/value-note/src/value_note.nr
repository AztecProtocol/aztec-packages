use dep::aztec::{
    context::PrivateContext,
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::{
        note_interface::NullifiableNote, retrieved_note::RetrievedNote,
        utils::compute_note_hash_for_nullify,
    },
    oracle::random::random,
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
    },
};

pub(crate) global VALUE_NOTE_LEN: u32 = 3; // 3 plus a header.

// docs:start:value-note-def
#[note]
#[derive(Eq)]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
// docs:end:value-note-def

impl NullifiableNote for ValueNote {
    // docs:start:nullifier

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

    // docs:end:nullifier

    unconstrained fn compute_nullifier_without_context(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Field {
        // We set the note_hash_counter to 0 as the note is assumed to be committed (and hence not transient).
        let retrieved_note =
            RetrievedNote { note: self, contract_address, nonce: note_nonce, note_hash_counter: 0 };
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
        let owner_npk_m_hash: Field = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl ValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        // so a malicious sender could use non-random values to make the note less private. But they already know
        // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        // information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };

        ValueNote { value, owner, randomness }
    }
}
