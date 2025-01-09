use crate::{
    context::PrivateContext,
    generators::Ga1 as G_val,
    note::{
        note_header::NoteHeader, note_interface::NoteInterface,
        utils::compute_note_hash_for_nullify,
    },
};

use crate::note::note_interface::NullifiableNote;
use dep::protocol_types::{
    address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
    hash::poseidon2_hash_with_separator,
};
use dep::std::{embedded_curve_ops::multi_scalar_mul, hash::from_field_unsafe};

global MOCK_NOTE_LENGTH: u32 = 1;

pub(crate) struct MockNote {
    pub(crate) header: NoteHeader,
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

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        // We don't use any kind of secret here since this is only a mock note and having it here would make tests
        // more cumbersome
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl NoteInterface<MOCK_NOTE_LENGTH> for MockNote {
    fn serialize_content(self) -> [Field; MOCK_NOTE_LENGTH] {
        [self.value]
    }

    fn deserialize_content(fields: [Field; MOCK_NOTE_LENGTH]) -> Self {
        Self { value: fields[0], header: NoteHeader::empty() }
    }

    fn get_header(self) -> NoteHeader {
        self.header
    }

    fn set_header(&mut self, header: NoteHeader) -> () {
        self.header = header;
    }

    fn get_note_type_id() -> Field {
        // randomly chosen note type id --> has to fit within 7 bits
        76
    }

    fn to_be_bytes(self, storage_slot: Field) -> [u8; MOCK_NOTE_LENGTH * 32 + 64] {
        let serialized_note = self.serialize_content();

        let mut buffer: [u8; MOCK_NOTE_LENGTH * 32 + 64] = [0; MOCK_NOTE_LENGTH * 32 + 64];

        let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();
        let note_type_id_bytes: [u8; 32] = MockNote::get_note_type_id().to_be_bytes();

        for i in 0..32 {
            buffer[i] = storage_slot_bytes[i];
            buffer[32 + i] = note_type_id_bytes[i];
        }

        for i in 0..serialized_note.len() {
            let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
            for j in 0..32 {
                buffer[64 + i * 32 + j] = bytes[j];
            }
        }
        buffer
    }

    fn compute_note_hash(self: Self) -> Field {
        assert(
            self.header.storage_slot != 0,
            "Storage slot must be set before computing note hash",
        );
        // We use the unsafe version because the multi_scalar_mul will constrain the scalars.
        let value_scalar = from_field_unsafe(self.value);
        multi_scalar_mul([G_val], [value_scalar]).x
    }
}

impl Eq for MockNote {
    fn eq(self, other: Self) -> bool {
        (self.header == other.header) & (self.value == other.value)
    }
}

pub(crate) struct MockNoteBuilder {
    value: Field,
    contract_address: Option<AztecAddress>,
    storage_slot: Option<Field>,
}

impl MockNoteBuilder {
    pub(crate) fn new(value: Field) -> Self {
        MockNoteBuilder { value, contract_address: Option::none(), storage_slot: Option::none() }
    }

    pub(crate) fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    pub(crate) fn storage_slot(&mut self, storage_slot: Field) -> &mut Self {
        self.storage_slot = Option::some(storage_slot);
        self
    }

    pub(crate) fn build(self) -> MockNote {
        let mut header = NoteHeader::empty();

        if self.contract_address.is_some() {
            header.contract_address = self.contract_address.unwrap();
        }

        if self.storage_slot.is_some() {
            header.storage_slot = self.storage_slot.unwrap();
        }

        MockNote { value: self.value, header }
    }
}

impl MockNote {
    pub(crate) fn new(value: Field) -> MockNoteBuilder {
        MockNoteBuilder::new(value)
    }
}
