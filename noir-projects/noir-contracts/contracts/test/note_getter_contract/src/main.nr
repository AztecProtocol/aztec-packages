use aztec::macros::aztec;
mod packed_note;

/// Used to test note getter in e2e_note_getter.test.ts
#[aztec]
pub contract NoteGetter {
    use aztec::{
        // Core functionality
        messages::delivery::MessageDelivery,
        note::note_interface::NoteProperties,
        // Macros
        macros::{functions::external, storage::storage},
        note::note_viewer_options::NoteViewerOptions,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateSet},
    };

    use field_note::FieldNote;

    use crate::packed_note::PackedNote;

    #[storage]
    struct Storage<Context> {
        set: Owned<PrivateSet<FieldNote, Context>, Context>,
        packed_set: Owned<PrivateSet<PackedNote, Context>, Context>,
    }

    #[external("private")]
    fn insert_note(value: Field) {
        let owner = self.msg_sender();
        let note = FieldNote { value };

        self.storage.set.at(owner).insert(note).deliver(MessageDelivery::onchain_unconstrained());
    }

    #[external("utility")]
    unconstrained fn read_note_values(owner: AztecAddress, comparator: u8, value: Field) -> BoundedVec<Field, 10> {
        let notes = self.storage.set.at(owner).view_notes(NoteViewerOptions::new().select(
            FieldNote::properties().value,
            comparator,
            value,
        ));
        notes.map(|note| note.value)
    }

    #[external("private")]
    fn insert_packed_note(high: u8, low: u8) {
        let owner = self.msg_sender();
        let note = PackedNote { high, low };

        self.storage.packed_set.at(owner).insert(note).deliver(MessageDelivery::onchain_unconstrained());
    }

    #[external("utility")]
    unconstrained fn select_packed_notes_by_high(
        owner: AztecAddress,
        comparator: u8,
        value: Field,
    ) -> BoundedVec<[u8; 2], 10> {
        let selector = PackedNote::high_selector();
        let notes =
            self.storage.packed_set.at(owner).view_notes(NoteViewerOptions::new().select(selector, comparator, value));
        notes.map(|note: PackedNote| [note.high, note.low])
    }

    #[external("utility")]
    unconstrained fn select_packed_notes_by_low(
        owner: AztecAddress,
        comparator: u8,
        value: Field,
    ) -> BoundedVec<[u8; 2], 10> {
        let selector = PackedNote::low_selector();
        let notes =
            self.storage.packed_set.at(owner).view_notes(NoteViewerOptions::new().select(selector, comparator, value));
        notes.map(|note: PackedNote| [note.high, note.low])
    }
}
