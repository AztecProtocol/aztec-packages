use dep::aztec::abi::MAX_READ_REQUESTS;
use dep::aztec::note::note_getter::NoteGetterOptions;
use dep::aztec::note::note_getter::view_notes;
use crate::notes::value_note::ValueNote;
use crate::notes::value_note::ValueNoteInterface;

fn get_all_notes<P>(notes: [ValueNote; MAX_READ_REQUESTS], x: P) -> [ValueNote; MAX_READ_REQUESTS] {
    notes
}

fn get_balance(storage_slot: Field, skip: Field) -> Field {
    let mut balance = 0;

    let mut options = NoteGetterOptions::new(get_all_notes, 0);
    options = options.set_skip(skip as u8);
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