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
        0
    }

    // Returns a hardcoded value so we can verify in tests that the macro-generated
    // `_compute_note_hash_and_nullifier` propagates the inner nullifier correctly.
    unconstrained fn compute_nullifier_unconstrained(
        _self: Self,
        _owner: AztecAddress,
        _note_hash_for_nullification: Field,
    ) -> Option<Field> {
        Option::some(2)
    }
}
