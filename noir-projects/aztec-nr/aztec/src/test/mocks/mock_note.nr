use crate::{
    context::PrivateContext,
    note::{
        note_interface::{NoteHash, NoteType},
        note_metadata::NoteMetadata,
        retrieved_note::RetrievedNote,
    },
};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER},
    hash::poseidon2_hash_with_separator,
    traits::Packable,
};

#[derive(Eq, Packable)]
pub(crate) struct MockNote {
    pub(crate) value: Field,
}

impl NoteType for MockNote {
    fn get_id() -> Field {
        // randomly chosen note type id --> has to fit within 7 bits
        76
    }
}

impl NoteHash for MockNote {
    fn compute_note_hash(self: Self, storage_slot: Field) -> Field {
        let input = self.pack().concat([storage_slot]);
        poseidon2_hash_with_separator(input, GENERATOR_INDEX__NOTE_HASH)
    }

    fn compute_nullifier(
        _self: Self,
        _context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        // We don't use any kind of secret here since this is only a mock note and having it here would make tests
        // more cumbersome
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(self, note_hash_for_nullify: Field) -> Field {
        // We don't use any kind of secret here since this is only a mock note and having it here would make tests
        // more cumbersome
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

pub(crate) struct MockNoteBuilder {
    value: Field,
    contract_address: Option<AztecAddress>,
    note_metadata: Option<NoteMetadata>,
}

impl MockNoteBuilder {
    pub(crate) fn new(value: Field) -> Self {
        MockNoteBuilder { value, contract_address: Option::none(), note_metadata: Option::none() }
    }

    pub(crate) fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    pub(crate) fn note_metadata(&mut self, note_metadata: NoteMetadata) -> &mut Self {
        self.note_metadata = Option::some(note_metadata);
        self
    }

    pub(crate) fn build_note(self) -> MockNote {
        MockNote { value: self.value }
    }

    pub(crate) fn build_retrieved_note(self) -> RetrievedNote<MockNote> {
        RetrievedNote {
            note: MockNote { value: self.value },
            contract_address: self.contract_address.unwrap_or(AztecAddress::zero()),
            // If the option is `None` for self.note_metadata, we fill it with invalid note metadata, which would result in the kernel
            // failing to prove note existence. Because our tests don't interact with the kernel this is not a problem.
            metadata: self.note_metadata.unwrap_or(std::mem::zeroed()),
        }
    }
}

impl MockNote {
    pub(crate) fn new(value: Field) -> MockNoteBuilder {
        MockNoteBuilder::new(value)
    }
}
