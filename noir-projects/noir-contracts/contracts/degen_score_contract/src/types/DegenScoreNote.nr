use dep::aztec::{
    protocol_types::{
    address::AztecAddress, traits::{Serialize, Deserialize}, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
    hash::poseidon2_hash_with_separator
},
    macros::notes::note,
    note::{note_header::NoteHeader, note_interface::NullifiableNote, utils::compute_note_hash_for_nullify},
    oracle::random::random, keys::getters::get_nsk_app, context::PrivateContext
};

#[note]
#[derive(Serialize)]
#[derive(Deserialize)]
struct DegenScoreNote {
    score: Field,
    owner: AztecAddress,
    randomness: Field,
}

impl NullifiableNote for DegenScoreNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.randomness);
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
        let secret = get_nsk_app(self.randomness);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }
}

impl DegenScoreNote {
    pub fn new(score: Field, owner: AztecAddress, randomness: Field) -> Self {
        let header = NoteHeader::empty();
        DegenScoreNote { score, owner, randomness, header }
    }
}

impl Eq for DegenScoreNote {
    fn eq(self, other: Self) -> bool {
        (self.owner == other.owner) & (self.randomness == other.randomness)
    }
}
