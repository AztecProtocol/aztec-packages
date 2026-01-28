use crate::note::note_metadata::NoteMetadata;
use protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};

/// A hint for a note that might exist.
///
/// This contains the actual note content and all metadata that is required in order to prove note's existence,
/// regardless of whether the note is pending or settled (see [crate::note::note_metadata::NoteMetadata]).
///
/// This value typically unconstrained (originating from oracles or as a contract function parameter), and can be
/// converted into a [crate::note::confirmed_note::ConfirmedNote] via
/// [crate::history::note::assert_note_existed_by].
#[derive(Deserialize, Eq, Serialize, Packable)]
pub struct HintedNote<Note> {
    pub note: Note,
    pub contract_address: AztecAddress,
    pub owner: AztecAddress,
    pub randomness: Field,
    pub storage_slot: Field,
    pub metadata: NoteMetadata,
}

mod test {
    use crate::note::{HintedNote, note_metadata::NoteMetadata};
    use protocol_types::{address::AztecAddress, traits::{FromField, Packable}};

    #[derive(Packable)]
    struct TestNote {
        value1: Field,
        value2: Field,
    }

    /// This test is a bit strange because in TS we don't have on the input the actual packed hinted note but
    /// instead we run `fromRawData` function to get the NoteMetadata and then we construct and pack the hinted
    /// note. To ensure that the `fromRawData` function matches the Noir one, we also run it here and compare the
    /// final packed hinted note. It would be more correct to have a separate unit test for the `fromRawData`
    /// function but I felt like it's not worth the effort. The code here is not that complex and it all should be
    /// straightforward to fix if the format, for whatever reason, changes.
    #[test]
    unconstrained fn packing_hinted_note_matches_typescript() {
        // The following 5 values are an input to the typescript function `packAsHintedNote`
        let contract_address = AztecAddress::from_field(1);
        let randomness = 42;
        let storage_slot = 100;
        let note_nonce = 2;
        let index = Option::<Field>::none(); // Transient note
        let packed_note = [3, 4];

        // Below we reproduce what the typescript function `packAsHintedNote` does. This is a bit strange but we
        // also want to test that the `fromRawData` function matches the Noir one.
        let note_is_transient = index.is_none();
        let nonzero_note_hash_counter = note_is_transient;
        let note_metadata = NoteMetadata::from_raw_data(nonzero_note_hash_counter, note_nonce);

        // Now we reconstruct the hinted note from the values above and pack it.
        let owner = AztecAddress::from_field(5);
        let hinted_note = HintedNote {
            note: TestNote::unpack(packed_note),
            contract_address,
            owner,
            randomness,
            storage_slot,
            metadata: note_metadata,
        };

        let packed_hinted_note = hinted_note.pack();

        let packed_hinted_note_from_typescript = [
            0x0000000000000000000000000000000000000000000000000000000000000003,
            0x0000000000000000000000000000000000000000000000000000000000000004,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000005,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x0000000000000000000000000000000000000000000000000000000000000064,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000002,
        ];

        assert_eq(
            packed_hinted_note,
            packed_hinted_note_from_typescript,
            "packed hinted note does not match value from typescript",
        );
    }
}
