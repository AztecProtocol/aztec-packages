use crate::notes::value_note::Note;
use crate::types::point::Point;

// Data returned when getting a note
struct NoteGetterData {
    note: Note,
    leaf_index: Field,
    sibling_path: [Field; crate::TREE_HEIGHT],
    root: Field,
}

fn make_note_getter_data(fields: [Field], start: comptime Field) -> NoteGetterData {
    NoteGetterData {
        note: Note {
            is_dummy: fields[start] as bool,
            nonce: fields[start + 1],
            owner: Point::new(fields[start + 2], fields[start + 3]),
            randomness: fields[start + 4],
            value: fields[start + 5],
        },
        leaf_index: fields[start + 6],
        sibling_path: [
            fields[start + 7],
            fields[start + 8],
            fields[start + 9],
            fields[start + 10],
            fields[start + 11],
        ],
        root: fields[start + 12],
    }
}