use crate::{note::note_metadata::NoteMetadata, utils::array::subarray::subarray};
use protocol_types::{address::AztecAddress, traits::{FromField, Packable, Serialize, ToField}};

// Number of fields a RetrievedNote adds to the packed or serialized representation of a note
// +1 for the contract address
// +2 for the note metadata
pub global RETRIEVED_NOTE_OVERHEAD: u32 = 1 + 2;

/// A container of a note and the metadata required to prove its existence, regardless of whether the note is
/// pending (created in the current transaction) or settled (created in a previous transaction).
#[derive(Eq)]
pub struct RetrievedNote<NOTE> {
    pub note: NOTE,
    pub contract_address: AztecAddress,
    pub metadata: NoteMetadata,
}

impl<NOTE> Serialize for RetrievedNote<NOTE>
where
    NOTE: Serialize,
{
    let N: u32 = <NOTE as Serialize>::N + RETRIEVED_NOTE_OVERHEAD;

    fn serialize(self) -> [Field; Self::N] {
        self.note.serialize().concat([self.contract_address.to_field()]).concat(self
            .metadata
            .serialize())
    }
}

// This function is not part of the Packable trait implementation because in the case of the retrieved note, the pack
// functionality resides in TS (oracle.ts and txe_service.ts).
pub fn unpack_retrieved_note<NOTE, let M: u32>(
    packed_retrieved_note: [Field; M + RETRIEVED_NOTE_OVERHEAD],
) -> RetrievedNote<NOTE>
where
    NOTE: Packable<N = M>,
{
    let contract_address = AztecAddress::from_field(packed_retrieved_note[0]);
    let note_nonce = packed_retrieved_note[1];
    let nonzero_note_hash_counter = (packed_retrieved_note[2] as u1) != 0;

    let packed_note = subarray(packed_retrieved_note, RETRIEVED_NOTE_OVERHEAD);
    let note = NOTE::unpack(packed_note);

    RetrievedNote {
        note,
        contract_address,
        metadata: NoteMetadata::from_raw_data(nonzero_note_hash_counter, note_nonce),
    }
}
