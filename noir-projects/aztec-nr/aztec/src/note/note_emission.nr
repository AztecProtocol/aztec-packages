/**
 * A note emission struct containing the information required for emitting a note.
 * The exact `emit` logic is passed in by the application code
 */
pub struct NoteEmission<Note> {
    pub note: Note,
    pub storage_slot: Field,
    pub note_hash_counter: u32, // a note_hash_counter of 0 means settled
}

impl<Note> NoteEmission<Note> {
    pub fn new(note: Note, storage_slot: Field, note_hash_counter: u32) -> Self {
        Self { note, storage_slot, note_hash_counter }
    }

    pub fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }

    pub fn discard(_self: Self) {}
}

/**
 * A struct wrapping note emission in `Option<T>`.
 * This is the struct provided to application codes, which can be used to emit
 * only when a note was actually inserted.
 * It is fairly common to have cases where a function conditionally inserts,
 * and this allows us to keep the same API for emission in both cases (e.g. inserting
 * a change note in a token's transfer function only when there is "change" left).
 */
pub struct OuterNoteEmission<Note> {
    pub emission: Option<NoteEmission<Note>>,
}

impl<Note> OuterNoteEmission<Note> {
    pub fn new(emission: Option<NoteEmission<Note>>) -> Self {
        Self { emission }
    }

    pub fn emit<Env>(self, _emit: fn[Env](NoteEmission<Note>) -> ()) {
        if self.emission.is_some() {
            _emit(self.emission.unwrap());
        }
    }

    pub fn discard(_self: Self) {}
}
