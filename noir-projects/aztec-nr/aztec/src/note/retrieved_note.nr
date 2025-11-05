use crate::note::note_metadata::NoteMetadata;
use protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};

/// A container of a note and the metadata required to prove its existence, regardless of whether the note is
/// pending (created in the current transaction) or settled (created in a previous transaction).
#[derive(Deserialize, Eq, Serialize, Packable)]
pub struct RetrievedNote<Note> {
    pub note: Note,
    pub contract_address: AztecAddress,
    pub metadata: NoteMetadata,
}

mod test {
    use crate::note::{note_metadata::NoteMetadata, retrieved_note::RetrievedNote};
    use protocol_types::{address::AztecAddress, traits::{FromField, Packable}};

    #[derive(Packable)]
    struct TestNote {
        value1: Field,
        value2: Field,
    }

    /// This test is a bit strange because in TS we don't have on the input the actual packed retrieved note but
    /// instead we run `fromRawData` function to get the NoteMetadata and then we construct and pack the retrieved
    /// note. To ensure that the `fromRawData` function matches the Noir one, we also run it here and compare the
    /// final packed retrieved note. It would be more correct to have a separate unit test for the `fromRawData`
    /// function but I felt like it's not worth the effort. The code here is not that complex and it all should be
    /// straightforward to fix if the format, for whatever reason, changes.
    #[test]
    unconstrained fn packing_retrieved_note_matches_typescript() {
        // The following 4 values are an input to the typescript function `packAsRetrievedNote`
        let contract_address = AztecAddress::from_field(1);
        let note_nonce = 2;
        let index = Option::<Field>::none(); // Transient note
        let packed_note = [3, 4];

        // Below we reproduce what the typescript function `packAsRetrievedNote` does. This is a bit strange but we
        // also want to test that the `fromRawData` function matches the Noir one.
        let note_is_transient = index.is_none();
        let nonzero_note_hash_counter = note_is_transient;
        let note_metadata = NoteMetadata::from_raw_data(nonzero_note_hash_counter, note_nonce);

        // Now we reconstruct the retrieved note from the values above and pack it.
        let retrieved_note = RetrievedNote {
            note: TestNote::unpack(packed_note),
            contract_address,
            metadata: note_metadata,
        };

        let packed_retrieved_note = retrieved_note.pack();

        let packed_retrieved_note_from_typescript = [
            0x0000000000000000000000000000000000000000000000000000000000000003,
            0x0000000000000000000000000000000000000000000000000000000000000004,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000002,
        ];

        assert_eq(
            packed_retrieved_note,
            packed_retrieved_note_from_typescript,
            "packed retrieved note does not match value from typescript",
        );
    }
}
