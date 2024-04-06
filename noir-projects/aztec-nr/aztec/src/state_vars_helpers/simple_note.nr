// use crate::{
//     note::{
//       note_header::NoteHeader,
//       note_interface::NoteInterface,
//   },
//     context::{Context,PrivateContext}, state_vars::{storage::Storage,map::Map},
// };
// use dep::protocol_types::{constants::INITIALIZATION_SLOT_SEPARATOR, traits::{Deserialize, Serialize}};

// global SIMPLE_NOTE_LENGTH = 1;

// struct SimpleNote {
//   header: NoteHeader,
//   value: Field,
// }

// impl SimpleNote {
//     pub fn new(value: Field) -> Self {
//         SimpleNote { value, header: NoteHeader::empty() }
//     }
// }

// impl NoteInterface<SIMPLE_NOTE_LENGTH> for SimpleNote {
//     fn serialize_content(self) -> [Field; SIMPLE_NOTE_LENGTH] {
//       [self.value]
//     }

//     fn deserialize_content(fields: [Field; SIMPLE_NOTE_LENGTH]) -> Self {
//       Self {
//         value: fields[0],
//         header: NoteHeader::empty(),
//       }
//     }

//     fn compute_note_content_hash(self) -> Field {
//       0
//     }

//     fn get_header(self) -> NoteHeader {
//       self.header
//     }

//     fn set_header(&mut self, header: NoteHeader) -> () {
//       self.header = header;
//     }

//     fn get_note_type_id() -> Field {
//       0
//     }

//     fn compute_nullifier(self, _context: &mut PrivateContext) -> Field {
//       0
//     }

//     fn compute_nullifier_without_context(self) -> Field {
//       0
//     }

//     fn broadcast(self, context: &mut PrivateContext, slot: Field) {
//       assert(
//         false, "SimpleNote does not support broadcast."
//       );
//     }
// }
