use crate::context::Context;
use crate::generators;
use crate::oracle;
use crate::note::note_getter::get_note;
use crate::note::note_interface::NoteInterface;

struct Singleton<Note, N> {
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
}

impl<Note, N> Singleton<Note, N> {
    fn new(storage_slot: Field, note_interface: NoteInterface<Note, N>) -> Self {
        Singleton { storage_slot, note_interface }
    }

    unconstrained fn is_initialised(self) -> bool {
        let nullifier = self.compute_initialisation_nullifier();
        oracle::is_nullifier_emitted(nullifier)
    }

    fn initialise(self, mut context: Context, note: Note) -> Context {
        // Nullify the storage slot.
        let nullifier = self.compute_initialisation_nullifier();
        context = context.push_new_nullifier(nullifier);

        // Add new note.
        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);
        context = context.push_new_note_hash(note_hash);

        // TODO: encrypt_and_emit

        context
    }

    fn compute_initialisation_nullifier(self) -> Field {
        let storage_slot = self.storage_slot;
        dep::std::hash::pedersen([
            generators::SINGLETON_INITIALISATION_GENERATOR,
            storage_slot,
        ])[0]
    }

    fn replace(self, mut context: Context, new_note: Note) -> (Context, Note) {
        let storage_slot = self.storage_slot;
        let (new_context, prev_note) = get_note(context, storage_slot, self.note_interface);
        context = new_context;

        // Nullify previous note.
        let compute_nullifier = self.note_interface.compute_nullifier;
        let nullifier = compute_nullifier(prev_note);
        context = context.push_new_nullifier(nullifier);

        // Add new note.
        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(new_note);
        context = context.push_new_note_hash(note_hash);

        (context, prev_note)
    }

    fn get_note(self, mut context: Context, replicate: fn (Note) -> Note) -> (Context, Note) {
        let storage_slot = self.storage_slot;
        let (new_context, note) = get_note(context, storage_slot, self.note_interface);
        context = new_context;
        let new_note = replicate(note);

        // Nullify current note.
        let compute_nullifier = self.note_interface.compute_nullifier;
        let nullifier = compute_nullifier(note);
        context = context.push_new_nullifier(nullifier);

        // Add replica.
        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(new_note);
        context = context.push_new_note_hash(note_hash);

        (context, note)
    }
}