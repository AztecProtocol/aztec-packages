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
        protocol_types::address::AztecAddress,
        state_vars::{Owned, PrivateSet},
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        set: Owned<PrivateSet<ValueNote, Context>, Context>,
    }

    #[external("private")]
    fn insert_note(value: Field) {
        let owner = self.msg_sender().unwrap();
        let note = ValueNote::new(value);

        self.storage.set.at(owner).insert(note).emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("utility")]
    unconstrained fn read_note_values(
        owner: AztecAddress,
        comparator: u8,
        value: Field,
    ) -> BoundedVec<Field, 10> {
        let notes = self.storage.set.at(owner).view_notes(NoteViewerOptions::new().select(
            ValueNote::properties().value,
            comparator,
            value,
        ));
        notes.map(|note| note.value())
    }
}
