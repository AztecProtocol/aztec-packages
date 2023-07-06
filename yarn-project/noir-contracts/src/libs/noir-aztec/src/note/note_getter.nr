use crate::context::Context;
use crate::note::note_getter_options::NoteGetterOptions;
use crate::note::note_hash::compute_siloed_note_hash;
use crate::note::note_interface::NoteInterface;
use crate::oracle;
use crate::oracle::debug_log::debug_log_format;

fn get_note<Note, N>(
    mut context: Context,
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
) -> (Context, Note) {
    let deserialise = note_interface.deserialise;
    let dummy = note_interface.dummy;
    let (context_tmp, note) = oracle::notes::get_note(context, storage_slot, deserialise, dummy);
    context = context_tmp;

    let mut note_hash = 0;
    let is_dummy = note_interface.is_dummy;
    if (!is_dummy(note)) {
        let compute_note_hash = note_interface.compute_note_hash;
        note_hash = compute_siloed_note_hash(storage_slot, compute_note_hash(note));
    };
    context = context.push_read_request(note_hash);

    (context, note)
}

fn get_notes<Note, N, S, P>(
    mut context: Context,
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    options: NoteGetterOptions<Note, N, S, P>,
) -> (Context, [Note; S]) {
    debug_log_format("get_notes context.oracle_connector was: {0}", [context.oracle_connector]);
    let (context_tmp, notes) = get_notes_internal(context, storage_slot, note_interface, options);
    context = context_tmp;
    debug_log_format("get_notes context.oracle_connector updated to: {0}", [context.oracle_connector]);
    let is_dummy = note_interface.is_dummy;
    for i in 0..notes.len() {
        let note = notes[i];
        let mut note_hash = 0;
        if !is_dummy(note) {
            let compute_note_hash = note_interface.compute_note_hash;
            note_hash = compute_siloed_note_hash(storage_slot, compute_note_hash(note));
        };
        context = context.push_read_request(note_hash);
    };

    (context, notes)
}

// TODO: Should be unconstrained.
fn get_notes_internal<Note, N, S, P>(
    mut context: Context,
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    options: NoteGetterOptions<Note, N, S, P>,
) -> (Context, [Note; S]) {
    let deserialise = note_interface.deserialise;
    let dummy = note_interface.dummy;
    let sort_by = options.sort_by;
    let mut sort_by_indices = [0; N];
    let mut sort_order = [0; N];
    for i in 0..sort_by.len() {
        sort_by_indices[i] = sort_by[i].field_index;
        sort_order[i] = sort_by[i].order;
    };
    let skip = options.skip;
    let filter = options.filter;
    let filter_args = options.filter_args;
    debug_log_format("get_notes_internal oracle_connector was: {0}", [context.oracle_connector]);
    let (context_tmp, notes) = oracle::notes::get_notes(context, storage_slot, deserialise, dummy, sort_by_indices, sort_order, skip, filter, filter_args);
    context = context_tmp;
    (context, notes)
}


global NOTES_PER_PAGE = 10; // TODO: Remove this.

fn create_note_arr<Note>(note: Note) -> [Note; NOTES_PER_PAGE] {
    [note; NOTES_PER_PAGE]
}

fn view_notes<Note, N>(
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    limit: u32,
    offset: u32,
) -> [Note; NOTES_PER_PAGE] {
    let deserialise = note_interface.deserialise;
    let dummy = note_interface.dummy;
    oracle::notes::view_notes(storage_slot, deserialise, dummy, limit, offset, create_note_arr)
}