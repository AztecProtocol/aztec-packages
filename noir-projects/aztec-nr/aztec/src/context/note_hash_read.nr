use protocol_types::address::aztec_address::AztecAddress;

pub struct NoteHashRead {
    note_hash: Field,
    contract_address: Option<AztecAddress>,
}

impl NoteHashRead {
    pub fn new_transient(note_hash: Field, contract_address: AztecAddress) -> Self {
        assert(
            !contract_address.is_zero(),
            "Can't read a transient note with a zero contract address",
        );
        Self { note_hash, contract_address: Option::some(contract_address) }
    }

    pub fn new_settled(note_hash: Field) -> Self {
        Self { note_hash, contract_address: Option::none() }
    }

    pub fn note_hash(self) -> Field {
        self.note_hash
    }

    pub fn contract_address(self) -> Option<AztecAddress> {
        self.contract_address
    }
}
