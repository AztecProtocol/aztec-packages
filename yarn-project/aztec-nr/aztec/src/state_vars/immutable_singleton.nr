use dep::std::option::Option;
use crate::constants_gen::EMPTY_NULLIFIED_COMMITMENT;
use crate::context::{PrivateContext, Context};
use crate::note::{
    lifecycle::create_note,
    note_getter::{get_note, view_notes},
    note_interface::NoteInterface,
    note_viewer_options::NoteViewerOptions,
};
use crate::oracle;
use crate::state_vars::singleton::compute_singleton_initialisation_nullifier;

// docs:start:struct
struct ImmutableSingleton<Note, N> {
    context: Option<&mut PrivateContext>,
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    compute_initialisation_nullifier: fn (Field) -> Field,
}
// docs:end:struct

impl<Note, N> ImmutableSingleton<Note, N> {
    // docs:start:new
    fn new(
        context: Context,
        storage_slot: Field,
        note_interface: NoteInterface<Note, N>,
    ) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        ImmutableSingleton {
            context: context.private,
            storage_slot,
            note_interface,
            compute_initialisation_nullifier: compute_singleton_initialisation_nullifier,
        }
    }
    // docs:end:new

    unconstrained fn is_initialized(self) -> bool {
        let compute_initialisation_nullifier = self.compute_initialisation_nullifier;
        let nullifier = compute_initialisation_nullifier(self.storage_slot);
        oracle::notes::is_nullifier_emitted(nullifier)
    }

    // docs:start:initialize
    fn initialize(self, note: &mut Note) {
        let context = self.context.unwrap_unchecked();

        // Nullify the storage slot.
        let compute_initialisation_nullifier = self.compute_initialisation_nullifier;
        let nullifier = compute_initialisation_nullifier(self.storage_slot);
        context.push_new_nullifier(nullifier, EMPTY_NULLIFIED_COMMITMENT);

        create_note(
            context,
            self.storage_slot,
            note,
            self.note_interface,
        );
    }
    // docs:end:initialize

    // docs:start:get_note
    fn get_note(self) -> Note {
        let context = self.context.unwrap_unchecked();
        let storage_slot = self.storage_slot;
        get_note(context, storage_slot, self.note_interface)
    }
    // docs:end:get_note

    unconstrained fn view_note(self) -> Note {
        let options = NoteViewerOptions::new().set_limit(1);
        view_notes(self.storage_slot, self.note_interface, options)[0].unwrap()
    }
}
