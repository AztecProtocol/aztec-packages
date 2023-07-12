use crate::context::Context;
use crate::note::{
    note_hash::compute_inner_note_hash,
    note_interface::NoteInterface,
};
use crate::oracle::notes::{notify_created_note, notify_nullified_note};

fn create_note<Note, N>(
    mut context: Context,
    storage_slot: Field,
    note: Note,
    note_interface: NoteInterface<Note, N>,
) -> Context {
    let mut inner_note_hash = 0;
    let is_dummy = note_interface.is_dummy;
    if is_dummy(note) == false {
        let compute_note_hash = note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);
        inner_note_hash = compute_inner_note_hash(storage_slot, note_hash);

        let serialise = note_interface.serialise;
        let preimage = serialise(note);
        assert(notify_created_note(storage_slot, preimage) == 0);
    };

    context.push_new_note_hash(inner_note_hash)
}

fn destroy_note<Note, N>(
    mut context: Context,
    storage_slot: Field,
    note: Note,
    note_interface: NoteInterface<Note, N>,
) -> Context {
    let mut nullifier = 0;
    let is_dummy = note_interface.is_dummy;
    if is_dummy(note) == false {
        let compute_nullifier = note_interface.compute_nullifier;
        nullifier = compute_nullifier(note);

        let serialise = note_interface.serialise;
        let preimage = serialise(note);
        assert(notify_nullified_note(storage_slot, nullifier, preimage) == 0);
    }

    context.push_new_nullifier(nullifier)
}