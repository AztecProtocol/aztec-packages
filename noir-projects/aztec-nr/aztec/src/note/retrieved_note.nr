use crate::note::note_metadata::NoteMetadata;
use protocol_types::{
    address::AztecAddress,
    traits::{Serialize, ToField},
    utils::arrays::array_concat,
};

/// A container of a note and the metadata required to prove its existence, regardless of whether the note is
/// pending (created in the current transaction) or settled (created in a previous transaction).
#[derive(Eq)]
pub struct RetrievedNote<NOTE> {
    pub note: NOTE,
    pub contract_address: AztecAddress,
    pub metadata: NoteMetadata,
}

impl<NOTE, let N: u32> Serialize<N + 1 + 2> for RetrievedNote<NOTE>
where
    NOTE: Serialize<N>,
{
    fn serialize(self) -> [Field; N + 1 + 2] {
        array_concat(
            array_concat(self.note.serialize(), [self.contract_address.to_field()]),
            self.metadata.serialize(),
        )
    }
}
