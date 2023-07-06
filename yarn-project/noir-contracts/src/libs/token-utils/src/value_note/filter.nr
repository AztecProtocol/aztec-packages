// use dep::aztec::abi::MAX_READ_REQUESTS;
use crate::value_note::value_note::ValueNote;

global MAX_READ_REQUESTS: comptime Field = 4; // HACKY COPY FOR LSP

fn get_2_notes<P>(notes: [ValueNote; MAX_READ_REQUESTS], x: P) -> [ValueNote; 2] {
    [notes[0], notes[1]]
}

fn get_all_notes<P>(notes: [ValueNote; 4], x: P) -> [ValueNote; MAX_READ_REQUESTS] {
    notes
}
