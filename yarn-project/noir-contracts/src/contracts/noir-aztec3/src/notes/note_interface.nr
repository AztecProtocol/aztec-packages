struct NoteInterface<Note, N> {

    note_length: comptime Field,

    from_fields: fn ([Field; N]) -> Note,

    to_fields: fn (Note) -> [Field; N],

    dummy: fn () -> Note,

    new: fn ([Field; N]) -> Note,

    compute_note_hash: fn (Note) -> Field,

    compute_nullifier: fn (Note, Field) -> Field,
}
