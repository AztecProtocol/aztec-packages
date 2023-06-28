use dep::aztec::types::point::Point;
use dep::aztec::utils::arr_copy_slice;
use dep::aztec::note::note_getter::view_notes;
use crate::value_note::value_note::ValueNoteInterface;
use crate::value_note::filter::get_all_notes;

// TODO(1.5) We don't support yet more than one page of notes
// noir is having issues with loop handling in unconstrained functions
// rewrite to unconstrained and integrate into noir-aztec when fixed
fn get_balance(storage_slot: Field, skip: Field) -> Field {
    let mut balance = 0;

    let mut options = NoteGetterOptions::new(get_all_notes, 0);
    options = options.set_skip(skip);
    let notes = view_notes(storage_slot, ValueNoteInterface, options);
    let len = notes.len();
    for i in 0..len {
        balance += notes[i].value;
    }
    if (notes[len - 1].is_dummy()) {
        balance += get_balance(storage_slot, len);
    }

    balance
}