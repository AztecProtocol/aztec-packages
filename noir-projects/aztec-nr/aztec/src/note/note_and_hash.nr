/// When obtaining notes via `get_notes(...)` a note hash is computed for each note when constraining it (and a read
/// request is created and passed to kernels). This same note hash (called note_hash_for_read_request) is needed when
/// removing notes. Since computing this hash is expensive and since it is needed when removing a note we return it
/// from the `get_notes(...)` function. The purpose of this struct is to couple the note and the note hash and make it
/// easier to pass these values around.
struct NoteAndHash<Note> {
   note: Note,
   hash: Field, // (note_hash_for_read_request)
}
