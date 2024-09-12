use std::meta::typ::fresh_type_variable;

comptime mut global NOTES = &[];

pub comptime fn note(s: StructDefinition) {
    // Automatically inject header if not present
    // let filtered_header = s.fields().filter(
    //     | (_, typ): (Quoted, Type) | typ.eq(quote { dep::aztec::note::note_header::NoteHeader}.as_type())
    // );
    // if (filtered_header.len() == 0) {
    //     let new_fields = s.fields().push_back((quote { header }, quote { dep::aztec::note::note_header::NoteHeader}.as_type()));
    //     s.set_fields(new_fields);
    // }

    let serialized_len_generic = fresh_type_variable();
    let bytes_len_generic = fresh_type_variable();
    let maybe_note_interface_impl = s.as_type().get_trait_impl(
        quote { crate::note::note_interface::NoteInterface<$serialized_len_generic, $bytes_len_generic> }.as_trait_constraint()
    );
    assert(maybe_note_interface_impl.is_some(), "Note must implement NoteInterface");
    let note_interface_impl = maybe_note_interface_impl.unwrap();
    let note_serialized_len = note_interface_impl.trait_generic_args()[0].as_constant().unwrap();
    // Register note here
    NOTES = NOTES.push_back((s, note_serialized_len));
    //note_interface_impl.
}
