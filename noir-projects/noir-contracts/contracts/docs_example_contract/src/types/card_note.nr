use dep::aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    protocol_types::{
        address::AztecAddress,
        constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
        traits::{Packable, Serialize},
    },
};
use dep::aztec::prelude::{NullifiableNote, PrivateContext, RetrievedNote};

// docs:start:state_vars-CardNote
global CARD_NOTE_LEN: u32 = 3; // 3 plus a header.

#[note]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
// docs:end:state_vars-CardNote

// docs:start:cardnote_impl
impl CardNote {
    pub fn new(points: u8, randomness: Field, owner: AztecAddress) -> Self {
        CardNote { points, randomness, owner }
    }
}
// docs:end:cardnote_impl

// docs:start:note_interface
impl NullifiableNote for CardNote {
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
// docs:end:note_interface

// docs:start:serialize
impl Serialize<3> for CardNote {
    fn serialize(self) -> [Field; 3] {
        [self.points.to_field(), self.randomness, self.owner.to_field()]
    }
}
// docs:end:serialize

impl Eq for CardNote {
    fn eq(self, other: Self) -> bool {
        (self.points == other.points)
            & (self.owner == other.owner)
            & (self.randomness == other.randomness)
    }
}
