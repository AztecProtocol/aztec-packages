// Data returned when getting a note
struct NoteGetterData<Note> {
    note: Note,
    leaf_index: Field,
    sibling_path: [Field; crate::TREE_HEIGHT],
    root: Field,
}

impl<Note> NoteGetterData<Note> {
    fn new(note: Note, leaf_index: Field, sibling_path: [Field; crate::TREE_HEIGHT], root: Field) -> Self {
        Self { note, leaf_index, sibling_path, root }
    }

    fn from_fields(fields: [Field], start: comptime Field, from_fields: fn ([Field], comptime Field) -> (Note, comptime Field)) -> Self {
        let (note, offset): (Note, comptime Field) = from_fields(fields, start);
        let leaf_index = fields[offset + 1];
        let sibling_path = [
            fields[offset + 2],
            fields[offset + 3],
            fields[offset + 4],
            fields[offset + 5],
            fields[offset + 6],
        ];
        let root = fields[offset + 7];
        NoteGetterData::new(note, leaf_index, sibling_path, root)
    }
}

// fn make_note_getter_data<Note>(fields: [Field], start: comptime Field, from_fields([Field], comptime Field) -> Note) -> NoteGetterData {
//     NoteGetterData<Note> {
//         (note: Note, offset: Field) = from_fields(fields, start),
//         leaf_index: fields[offset + 1],
//         sibling_path: [
//             fields[offset + 2],
//             fields[offset + 3],
//             fields[offset + 4],
//             fields[offset + 5],
//             fields[offset + 6],
//         ],
//         root: fields[offset + 7],
//     }
// }