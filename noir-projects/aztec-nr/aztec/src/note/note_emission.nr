struct NoteEmission<Note> {
    storage_slot: Field,
    note: Note
}

impl<Note> NoteEmission<Note> {
    pub fn new(storage_slot: Field, note: Note) -> Self {
        Self { storage_slot, note }
    }

    pub fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self)
    }

    pub fn discard(self) {}
}
