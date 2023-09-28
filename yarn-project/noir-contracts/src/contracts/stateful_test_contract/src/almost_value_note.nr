
use dep::value_note::value_note::ValueNote;
use dep::aztec::note::note_header::NoteHeader;

struct AlmostValueNote {
    value: Field,
    owner: Field,
    randomness: Field,
    header: NoteHeader,
}

impl AlmostValueNote {
    fn serialize(self) -> [Field; 6] {
        [self.value, self.owner, self.randomness, self.header.contract_address, self.header.nonce, self.header.storage_slot]
    }

    fn deserialize(serialized: [Field; 6]) -> Self {
        AlmostValueNote {
            value: serialized[0],
            owner: serialized[1],
            randomness: serialized[2],
            header: NoteHeader {
                contract_address: serialized[3],
                nonce: serialized[4],
                storage_slot: serialized[5],
            },
        }
    }

    fn to_value_note(self) -> ValueNote {
        ValueNote {
            value: self.value,
            owner: self.owner,
            randomness: self.randomness,
            header: self.header,
        }
    }
}