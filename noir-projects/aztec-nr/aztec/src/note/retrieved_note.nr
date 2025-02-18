use protocol_types::{address::AztecAddress, traits::Serialize, utils::arrays::array_concat};

/// A container of a note and the metadata required to constrain its existence, regardless of whether the note is
/// historical (created in a previous transaction) or transient (created in the current transaction).
pub struct RetrievedNote<NOTE> {
    pub note: NOTE,
    pub contract_address: AztecAddress,
    pub nonce: Field,
    pub note_hash_counter: u32, // a note_hash_counter of 0 means non-transient
}

impl<NOTE> Eq for RetrievedNote<NOTE>
where
    NOTE: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.note == other.note)
            & (self.contract_address == other.contract_address)
            & (self.nonce == other.nonce)
            & (self.note_hash_counter == other.note_hash_counter)
    }
}

impl<NOTE, let N: u32> Serialize<N + 3> for RetrievedNote<NOTE>
where
    NOTE: Serialize<N>,
{
    fn serialize(self) -> [Field; N + 3] {
        array_concat(
            self.note.serialize(),
            [self.contract_address.to_field(), self.nonce, self.note_hash_counter as Field],
        )
    }
}
