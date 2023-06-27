use dep::aztec::types::point::Point;
use dep::aztec::utils::arr_copy_slice;
use dep::aztec::note::note_getter::view_notes;
use crate::value_note::value_note::ValueNoteInterface;
use crate::value_note::filter::get_2_notes;

fn view_notes_page(
    storage_slot: Field,
    skip: Field,
) -> [ValueNote; 2] {
    let mut options = NoteGetterOptions::new(get_2_notes, 0);
    options = options.set_skip(skip);
    view_notes(storage_slot, ValueNoteInterface, options)
}

// TODO(1.5) We don't support yet more than one page of notes
// noir is having issues with loop handling in unconstrained functions
// rewrite to unconstrained and integrate into noir-aztec when fixed
fn get_balance(storage_slot: Field) -> Field {
    let mut balance = 0;

    let mut current_batch = view_notes_page(storage_slot, 0);    
    for j in 0..current_batch.len() {
        balance += current_batch[j].value;
    }

    balance
}