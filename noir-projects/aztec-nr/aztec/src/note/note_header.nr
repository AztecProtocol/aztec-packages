use dep::protocol_types::{address::AztecAddress, traits::{Empty, Serialize}};
use std::meta::derive;

#[derive(Eq, Serialize)]
pub struct NoteHeader {
    pub contract_address: AztecAddress,
    pub nonce: Field,
    pub storage_slot: Field,
    pub note_hash_counter: u32, // a note_hash_counter of 0 means non-transient
}

impl Empty for NoteHeader {
    fn empty() -> Self {
        NoteHeader {
            contract_address: AztecAddress::zero(),
            nonce: 0,
            storage_slot: 0,
            note_hash_counter: 0,
        }
    }
}

impl NoteHeader {
    pub fn new(contract_address: AztecAddress, nonce: Field, storage_slot: Field) -> Self {
        NoteHeader { contract_address, nonce, storage_slot, note_hash_counter: 0 }
    }
}
