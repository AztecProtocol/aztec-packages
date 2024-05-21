use crate::{context::PrivateContext, note::{note_header::NoteHeader, note_interface::NoteInterface}};

use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint};

global MOCK_NOTE_LENGTH = 1;

struct MockNote {
  header: NoteHeader,
  value: Field,
}

impl NoteInterface<MOCK_NOTE_LENGTH> for MockNote {
    fn serialize_content(self) -> [Field; MOCK_NOTE_LENGTH] {
      [self.value]
    }

    fn deserialize_content(fields: [Field; MOCK_NOTE_LENGTH]) -> Self {
      Self {
        value: fields[0],
        header: NoteHeader::empty(),
      }
    }

    fn compute_note_content_hash(self) -> Field {
      0
    }

    fn get_header(self) -> NoteHeader {
      self.header
    }

    fn set_header(&mut self, header: NoteHeader) -> () {
      self.header = header;
    }

    fn get_note_type_id() -> Field {
      0
    }

    fn compute_nullifier(self, _context: &mut PrivateContext) -> Field {
      0
    }

    fn compute_nullifier_without_context(self) -> Field {
      0
    }

    fn broadcast(self, context: &mut PrivateContext, slot: Field, ivpk_m: GrumpkinPoint) {
      assert(
        false, "MockNote does not support broadcast."
      );
    }
}

struct MockNoteBuilder {
    value: Field,
    contract_address: Option<AztecAddress>,
    storage_slot: Option<Field>,
}

impl MockNoteBuilder {
    fn new(value: Field) -> Self {
        MockNoteBuilder { value, contract_address: Option::none(), storage_slot: Option::none() }
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    fn storage_slot(&mut self, storage_slot: Field) -> &mut Self {
        self.storage_slot = Option::some(storage_slot);
        self
    }

    fn build(self) -> MockNote {
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
    pub fn new(value: Field) -> MockNoteBuilder {
        MockNoteBuilder::new(value)
    }
}
