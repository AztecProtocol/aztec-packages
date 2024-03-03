use dep::protocol_types::address::AztecAddress;
use dep::protocol_types::traits::{Empty, Serialize};

struct NoteHeader {
    contract_address: AztecAddress,
    nonce: Field,
    storage_slot: Field,
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1386)
    // Remove this and check the nonce to see whether a note is transient or not.
    is_transient: bool,

    // this will be non-zero if this note was partially built at a previous time
    partial_note_hash: Field,
}

impl Empty for NoteHeader {
    fn empty() -> Self {
        NoteHeader { contract_address: AztecAddress::zero(), nonce: 0, storage_slot: 0, is_transient: false, partial_note_hash: 0 }
    }
}

impl NoteHeader {
    pub fn new(contract_address: AztecAddress, nonce: Field, storage_slot: Field) -> Self {
        NoteHeader { contract_address, nonce, storage_slot, is_transient: false, partial_note_hash: 0 }
    }

    pub fn is_partial(self) -> bool {
        self.partial_note_hash != 0
    }
}

impl Serialize<4> for NoteHeader {
    fn serialize(self) -> [Field; 4] {
        [self.contract_address.to_field(), self.nonce, self.storage_slot, self.is_transient as Field]
    }
}
