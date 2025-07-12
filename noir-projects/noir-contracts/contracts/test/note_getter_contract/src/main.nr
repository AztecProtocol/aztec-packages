use aztec::macros::aztec;

/// Used to test note getter in e2e_note_getter.test.ts
#[aztec]
pub contract NoteGetter {
    use aztec::{
        // Core functionality
        messages::logs::note::encode_and_encrypt_note,
        note::note_interface::NoteProperties,
        // Macros
        macros::{functions::{private, utility}, storage::storage},
        note::note_viewer_options::NoteViewerOptions,
        state_vars::PrivateSet,
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        set: PrivateSet<ValueNote, Context>,
    }

    #[private]
    fn insert_note(value: Field) {
        let note = ValueNote::new(value, context.msg_sender());

        storage.set.insert(note).emit(encode_and_encrypt_note(&mut context, context.msg_sender()));
    }

    #[utility]
    unconstrained fn read_note_values(comparator: u8, value: Field) -> BoundedVec<Field, 10> {
        let notes = storage.set.view_notes(NoteViewerOptions::new().select(
            ValueNote::properties().value,
            comparator,
            value,
        ));
        notes.map(|note| note.value())
    }
}
