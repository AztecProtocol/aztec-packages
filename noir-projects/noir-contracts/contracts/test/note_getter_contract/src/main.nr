use aztec::macros::aztec;

/// Used to test note getter in e2e_note_getter.test.ts
#[aztec]
pub contract NoteGetter {
    use aztec::{
        // Core functionality
        messages::message_delivery::MessageDelivery,
        note::note_interface::NoteProperties,
        // Macros
        macros::{functions::external, storage::storage},
        note::note_viewer_options::NoteViewerOptions,
        state_vars::PrivateSet,
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        set: PrivateSet<ValueNote, Context>,
    }

    #[external("private")]
    fn insert_note(value: Field) {
        let note = ValueNote::new(value, self.msg_sender().unwrap());

        self.storage.set.insert(note).emit(
            self.msg_sender().unwrap(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("utility")]
    unconstrained fn read_note_values(comparator: u8, value: Field) -> BoundedVec<Field, 10> {
        let notes = self.storage.set.view_notes(NoteViewerOptions::new().select(
            ValueNote::properties().value,
            comparator,
            value,
        ));
        notes.map(|note| note.value())
    }
}
