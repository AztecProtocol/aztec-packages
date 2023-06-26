struct NoteInterface<Note, N> {
    deserialise: fn ([Field; N]) -> Note,

    serialise: fn (Note) -> [Field; N],

    compute_note_hash: fn (Note) -> Field,

    compute_nullifier: fn (Note) -> Field,

    dummy: fn () -> Note,

    is_dummy: fn (Note) -> bool,
}

// fn compute_siloed_note_hash(note_hash: Field, storage_slot: Field) -> Field {
//     dep::std::hash::pedersen([
//         generators::NOTE_HASH_WITH_STORAGE_SLOT_GENERATOR,
//         storage_slot,
//         note_hash
//     ])[0]
// }
