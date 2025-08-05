use crate::note::note_metadata::NoteMetadata;
use protocol_types::{address::AztecAddress, traits::{Packable, Serialize}};

/// A container of a note and the metadata required to prove its existence, regardless of whether the note is
/// pending (created in the current transaction) or settled (created in a previous transaction).
#[derive(Eq, Serialize, Packable)]
pub struct RetrievedNote<Note> {
    pub note: Note,
    pub contract_address: AztecAddress,
    pub metadata: NoteMetadata,
}

// // This function is not part of the Packable trait implementation because in the case of the retrieved note, the pack
// // functionality resides in TS (oracle.ts and txe_service.ts).
// pub fn unpack_retrieved_note<Note>(
//     packed_retrieved_note: [Field; <RetrievedNote<Note> as Packable>::N],
// ) -> RetrievedNote<Note>
// where
//     Note: Packable,
// {
//     let contract_address = AztecAddress::from_field(packed_retrieved_note[0]);
//     let note_nonce = packed_retrieved_note[1];
//     let nonzero_note_hash_counter = (packed_retrieved_note[2] as u1) != 0;

//     let packed_note = subarray(packed_retrieved_note, <RetrievedNote<Note> as Packable>::N);
//     let note = Note::unpack(packed_note);

//     RetrievedNote {
//         note,
//         contract_address,
//         metadata: NoteMetadata::from_raw_data(nonzero_note_hash_counter, note_nonce),
//     }
// }
