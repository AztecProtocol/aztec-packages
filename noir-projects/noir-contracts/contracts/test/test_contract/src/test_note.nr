use dep::aztec::{
    context::PrivateContext,
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    protocol::{
        address::AztecAddress, constants::DOM_SEP__NOTE_HASH, hash::poseidon2_hash_with_separator,
        traits::Packable,
    },
};

/// A note used only for testing purposes.
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
        // The note is inserted into the state in the Test contract so we provide a real compute_note_hash
        // implementation.
        let inputs = self.pack().concat([storage_slot, randomness]);
        poseidon2_hash_with_separator(inputs, DOM_SEP__NOTE_HASH)
    }

    fn compute_nullifier(
        _self: Self,
        _context: &mut PrivateContext,
        _owner: AztecAddress,
        _note_hash_for_nullification: Field,
    ) -> Field {
        // This note's nullifier is never used for any meaningful purpose so we don't care about having a real
        // implementation here.
        0
    }

    unconstrained fn compute_nullifier_unconstrained(
        _self: Self,
        _owner: AztecAddress,
        _note_hash_for_nullification: Field,
    ) -> Option<Field> {
        // This note's nullifier is never used for any meaningful purpose so we don't care about having a real
        // implementation here.
        Option::none()
    }
}
