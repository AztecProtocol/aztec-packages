use crate::note::note_metadata::NoteMetadata;
use protocol_types::{
    address::AztecAddress,
    traits::{Serialize, ToField},
    utils::arrays::array_concat,
};

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

impl<NOTE, let N: u32> Serialize<N + RETRIEVED_NOTE_OVERHEAD> for RetrievedNote<NOTE>
where
    NOTE: Serialize<N>,
{
    fn serialize(self) -> [Field; N + RETRIEVED_NOTE_OVERHEAD] {
        array_concat(
            array_concat(self.note.serialize(), [self.contract_address.to_field()]),
            self.metadata.serialize(),
        )
    }
}
