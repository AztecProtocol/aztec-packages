comptime fn note(s: StructDefinition) {
    // Automatically inject header if not present
    let filtered_header = s.fields().filter(
        | (field, typ): (Quoted, Type) | typ.eq(quote { dep::aztec::note::note_header::NoteHeader}.as_type())
    );
    if (filtered_header.len() == 0) {
        let _ = s.fields().push_back((quote { header }, quote { dep::aztec::note::note_header::NoteHeader}.as_type()));
    }
}
