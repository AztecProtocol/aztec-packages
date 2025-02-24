use crate::note::note_metadata::NoteMetadata;
use protocol_types::{
    address::AztecAddress,
    traits::{Serialize, ToField},
    utils::arrays::array_concat,
};

/// A container of a note and the metadata required to constrain its existence, regardless of whether the note is
/// historical (created in a previous transaction) or transient (created in the current transaction).
#[derive(Eq)]
pub struct RetrievedNote<NOTE> {
    pub note: NOTE,
    pub contract_address: AztecAddress,
    pub metadata: NoteMetadata,
}

impl<NOTE, let N: u32> Serialize<N + 1 + 3> for RetrievedNote<NOTE>
where
    NOTE: Serialize<N>,
{
    fn serialize(self) -> [Field; N + 1 + 3] {
        array_concat(
            array_concat(self.note.serialize(), [self.contract_address.to_field()]),
            self.metadata.serialize(),
        )
    }
}
