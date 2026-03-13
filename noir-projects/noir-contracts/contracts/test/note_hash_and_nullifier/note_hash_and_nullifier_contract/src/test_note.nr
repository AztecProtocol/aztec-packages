use aztec::{
    context::PrivateContext,
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    protocol::{
        address::AztecAddress, constants::DOM_SEP__NOTE_HASH, hash::poseidon2_hash_with_separator,
        traits::Packable,
    },
};

#[derive(Eq, Packable)]
#[custom_note]
pub struct TestNote {
    pub value: Field,
}

pub global TEST_NOTE_NULLIFIER: Field = 2;

impl NoteHash for TestNote {
    fn compute_note_hash(
        self,
        _owner: AztecAddress,
        storage_slot: Field,
        randomness: Field,
    ) -> Field {
        let inputs = self.pack().concat([storage_slot, randomness]);
        poseidon2_hash_with_separator(inputs, DOM_SEP__NOTE_HASH)
    }

    fn compute_nullifier(
        _self: Self,
        _context: &mut PrivateContext,
        _owner: AztecAddress,
        _note_hash_for_nullification: Field,
    ) -> Field {
        // Not used in any meaningful way
        0
    }

    unconstrained fn compute_nullifier_unconstrained(
        _self: Self,
        _owner: AztecAddress,
        _note_hash_for_nullification: Field,
    ) -> Option<Field> {
        // Returns a hardcoded value so we can verify that `_compute_note_hash_and_nullifier` propagates it correctly.
        Option::some(TEST_NOTE_NULLIFIER)
    }
}
