use crate::{
    context::PrivateContext,
    note::{
        note_interface::NoteInterface, retrieved_note::RetrievedNote,
        utils::compute_note_hash_for_nullify,
    },
};

use crate::note::note_interface::NullifiableNote;
use dep::protocol_types::{
    address::AztecAddress,
    constants::{GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER},
    hash::poseidon2_hash_with_separator,
    utils::arrays::array_concat,
};

global MOCK_NOTE_LENGTH: u32 = 1;

pub(crate) struct MockNote {
    pub(crate) value: Field,
}

impl NullifiableNote for MockNote {
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

    unconstrained fn compute_nullifier_without_context(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Field {
        // We set the note_hash_counter to 0 as the note is not transient and the concept of transient note does
        // not make sense in an unconstrained context.
        let retrieved_note =
            RetrievedNote { note: self, contract_address, nonce: note_nonce, note_hash_counter: 0 };
        // We don't use any kind of secret here since this is only a mock note and having it here would make tests
        // more cumbersome
        let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl NoteInterface<MOCK_NOTE_LENGTH> for MockNote {
    fn pack_content(self) -> [Field; MOCK_NOTE_LENGTH] {
        [self.value]
    }

    fn unpack_content(fields: [Field; MOCK_NOTE_LENGTH]) -> Self {
        Self { value: fields[0] }
    }

    fn get_note_type_id() -> Field {
        // randomly chosen note type id --> has to fit within 7 bits
        76
    }

    fn compute_note_hash(self: Self, storage_slot: Field) -> Field {
        // We use Poseidon2 instead of multi-scalar multiplication (MSM) here since this is not a partial note
        // and therefore does not require MSM's additive homomorphism property. Additionally, Poseidon2 uses fewer
        // constraints.
        let input = array_concat(self.pack_content(), [storage_slot]);
        poseidon2_hash_with_separator(input, GENERATOR_INDEX__NOTE_HASH)
    }
}

impl Eq for MockNote {
    fn eq(self, other: Self) -> bool {
        self.value == other.value
    }
}

pub(crate) struct MockNoteBuilder {
    value: Field,
    contract_address: Option<AztecAddress>,
}

impl MockNoteBuilder {
    pub(crate) fn new(value: Field) -> Self {
        MockNoteBuilder { value, contract_address: Option::none() }
    }

    pub(crate) fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    pub(crate) fn build_note(self) -> MockNote {
        MockNote { value: self.value }
    }

    pub(crate) fn build_retrieved_note(self) -> RetrievedNote<MockNote> {
        RetrievedNote {
            note: MockNote { value: self.value },
            contract_address: self.contract_address.unwrap_or(AztecAddress::zero()),
            nonce: 0,
            note_hash_counter: 0,
        }
    }
}

impl MockNote {
    pub(crate) fn new(value: Field) -> MockNoteBuilder {
        MockNoteBuilder::new(value)
    }
}
