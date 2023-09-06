use crate::oracle::get_note_hash::NOTE_HASH_GETTER_LENGTH;

struct NoteHashGetterData {
    message: Field,
    leaf_index: Field,
    root: Field,
}

fn make_note_hash_getter_data(fields: [Field; NOTE_HASH_GETTER_LENGTH], start: Field) -> NoteHashGetterData {
    NoteHashGetterData {
        message: fields[start],
        leaf_index: fields[start + 1],
        root: fields[start + 2],
    }
}