use dep::aztec::abi::MAX_READ_REQUESTS;
use dep::aztec::note::note_getter::NoteGetterOptions;
use dep::aztec::note::note_getter::view_notes;
use dep::aztec::note::note_getter_options::Sort;
use crate::notes::value_note::VALUE_NOTE_LEN;
use crate::notes::value_note::ValueNote;
use crate::notes::value_note::ValueNoteInterface;

fn get_all_notes<P>(notes: [ValueNote; MAX_READ_REQUESTS], x: P) -> [ValueNote; MAX_READ_REQUESTS] {
    notes
}

fn get_balance(storage_slot: Field, skip: u32) -> Field {
    let mut balance = 0;

    let options = NoteGetterOptions::new(get_all_notes, 0, [Sort::nada(); VALUE_NOTE_LEN], skip);
    let notes = view_notes(storage_slot, ValueNoteInterface, options);
    let len = notes.len();
    for i in 0..len {
        balance += notes[i].value;
    }
    // TODO
    // if (notes[len - 1].is_dummy()) {
    //     balance += get_balance(storage_slot, len);
    // }

    balance
}