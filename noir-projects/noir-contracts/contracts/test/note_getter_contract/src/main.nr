use aztec::macros::aztec;

/// Used to test note getter in e2e_note_getter.test.ts
#[aztec]
pub contract NoteGetter {
    use aztec::{
        // Core functionality
        encrypted_logs::log_assembly_strategies::default_aes128::note::encode_and_encrypt_note,
        note::note_interface::NoteProperties,
        // Macros
        macros::{functions::{private, utility}, storage::storage},
        // Prelude types
        prelude::{NoteViewerOptions, PrivateSet},
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        set: PrivateSet<ValueNote, Context>,
    }

    #[private]
    fn insert_note(value: Field) {
        let note = ValueNote::new(value, context.msg_sender());

        storage.set.insert(note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }

    #[private]
    fn insert_notes(values: [Field; 3]) {
        for i in 0..values.len() {
            let note = ValueNote::new(values[i], context.msg_sender());
            storage.set.insert(note).emit(encode_and_encrypt_note(
                &mut context,
                context.msg_sender(),
                context.msg_sender(),
            ));
        }
    }

    #[utility]
    unconstrained fn read_note_values(comparator: u8, value: Field) -> BoundedVec<Field, 10> {
        let mut options = NoteViewerOptions::new();
        let notes = storage.set.view_notes(options.select(
            ValueNote::properties().value,
            comparator,
            value,
        ));
        notes.map(|note| note.value())
    }
}
