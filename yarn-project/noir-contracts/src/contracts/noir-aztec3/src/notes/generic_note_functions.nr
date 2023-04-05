struct GenericNoteFunctions<Note, N> {
    // size: fn () -> comptime Field,

    from_fields: fn ([Field; N], comptime Field) -> (Note, comptime Field),

    to_fields: fn (Note) -> [Field; N],

    compute_note_hash: fn (Note) -> Field,

    compute_nullifier: fn (Note, Field) -> Field,
}