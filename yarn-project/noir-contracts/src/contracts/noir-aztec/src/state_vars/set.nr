use crate::context::Context;
use crate::note::note_getter::get_notes;
use crate::note::note_getter_options::NoteGetterOptions;
use crate::note::note_interface::NoteInterface;
use crate::generators;

struct Set<Note, N> {
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
}

impl<Note, N> Set<Note, N> {
    fn new(storage_slot: Field, note_interface: NoteInterface<Note, N>) -> Self {
        Set { storage_slot, note_interface }
    }

    fn insert(self, mut context: Context, note: Note) -> Context {
        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);
        context.push_new_note_hash(note_hash)
    }

    fn remove(self, mut context: Context, note: Note) -> Context {
        let compute_nullifier = self.note_interface.compute_nullifier;
        let nullifier = compute_nullifier(note);
        context.push_new_nullifier(nullifier)
    }

    fn get_notes<S, P>(
        self,
        mut context: Context,
        options: NoteGetterOptions<Note, N, S, P>,
    ) -> (Context, [Note; S]) {
        let storage_slot = self.storage_slot;
        let (new_context, notes) = get_notes(context, storage_slot, self.note_interface, options);
        (new_context, notes)
    }
}
