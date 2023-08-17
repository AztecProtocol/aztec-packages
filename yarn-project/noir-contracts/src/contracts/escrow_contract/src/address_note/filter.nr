use dep::aztec::constants_gen::MAX_READ_REQUESTS_PER_CALL;
use dep::aztec::types::option::Option;

use crate::address_note::AddressNote;

fn get_owner_note(notes: [Option<AddressNote>; MAX_READ_REQUESTS_PER_CALL], params: [Field; 2]) -> [Option<AddressNote>; 1] {
    let address = params[0];
    let owner = params[1];
    let mut owner_note = [Option::none(AddressNote::dummy())];
    for i in 0..notes.len() {
        if notes[i].is_some() {
            let note = notes[i].unwrap();
            if (note.address == address) & (note.owner == owner) {
                owner_note[0] = notes[i];
            }
        }
    }
    owner_note
}
