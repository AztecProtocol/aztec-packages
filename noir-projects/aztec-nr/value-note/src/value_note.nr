use dep::aztec::{
    context::PrivateContext,
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::{
        note_header::NoteHeader, note_interface::NullifiableNote,
        utils::compute_note_hash_for_nullify,
    },
    oracle::random::random,
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator, traits::Serialize,
    },
};

global VALUE_NOTE_LEN: u32 = 3; // 3 plus a header.

// docs:start:value-note-def
// ValueNote is used as fn parameter in the Claim contract, so it has to implement the Serialize trait.
// It is important that the order of these annotations is preserved so that derive(Serialize) runs AFTER the note macro, which injects the note header.
#[note]
#[derive(Serialize)]
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

impl ValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        // We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
        // malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        let header = NoteHeader::empty();
        ValueNote { value, owner, randomness, header }
    }
}

impl Eq for ValueNote {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value)
            & (self.owner == other.owner)
            & (self.randomness == other.randomness)
    }
}
