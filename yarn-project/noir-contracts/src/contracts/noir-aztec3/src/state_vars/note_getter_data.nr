use crate::notes::value_note::ValueNote;
// use crate::notes::value_note::NOTE_LEN;
use crate::types::point::Point;
use crate::utils::arr_copy_slice;

// Data returned when getting a note
struct NoteGetterData<Note> {
    note: Note,
    leaf_index: Field,
    sibling_path: [Field; crate::PRIVATE_DATA_TREE_HEIGHT],
    root: Field,
}

fn note_getter_data_len(note_length: Field) -> Field {
    note_length + 1 + crate::PRIVATE_DATA_TREE_HEIGHT + 1
}

fn make_note_getter_data<Note, N>(
    fields: [Field],
    start: comptime Field,
    note_from_fields: fn([Field; N]) -> Note
) -> NoteGetterData<Note> {
    let note = note_from_fields(arr_copy_slice(fields, [0; N], start));
    let mut offset: comptime Field = start + N;

    let leaf_index = fields[offset];
    offset += 1;

    let sibling_path = arr_copy_slice(fields, [0; crate::PRIVATE_DATA_TREE_HEIGHT], offset);
    offset += crate::PRIVATE_DATA_TREE_HEIGHT;

    let root = fields[offset];

    NoteGetterData {
        note,
        leaf_index,
        sibling_path,
        root,
    }
}