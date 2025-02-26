use dep::aztec::{
    context::PrivateContext,
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    protocol_types::{
        constants::GENERATOR_INDEX__NOTE_HASH, hash::poseidon2_hash_with_separator,
        traits::Packable, utils::arrays::array_concat,
    },
};

/// A note used only for testing purposes.
#[custom_note]
pub struct TestNote {
    value: Field,
}

impl NoteHash for TestNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        // The note is inserted into the state in the Test contract so we provide a real compute_note_hash
        // implementation.
        let inputs = array_concat(self.pack(), [storage_slot]);
        poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__NOTE_HASH)
    }

    fn compute_nullifier(
        _self: Self,
        _context: &mut PrivateContext,
        _note_hash_for_nullify: Field,
    ) -> Field {
        panic(f"Unimplemented")
    }

    unconstrained fn compute_nullifier_unconstrained(
        _self: Self,
        _note_hash_for_nullify: Field,
    ) -> Field {
        panic(f"Unimplemented")
    }
}

impl TestNote {
    pub fn new(value: Field) -> Self {
        TestNote { value }
    }

    pub fn get_value(self) -> Field {
        self.value
    }
}
