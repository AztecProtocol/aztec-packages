use crate::{
    abis::{read_request::ScopedReadRequest, side_effect::{Ordered, OrderedValue, Readable, Scoped}},
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct NoteHash {
    pub value: Field,
    pub counter: u32,
}

impl Ordered for NoteHash {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Empty for NoteHash {
    fn empty() -> Self {
        NoteHash { value: 0, counter: 0 }
    }
}

impl NoteHash {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedNoteHash {
        ScopedNoteHash { note_hash: self, contract_address }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedNoteHash {
    pub note_hash: NoteHash,
    pub contract_address: AztecAddress,
}

impl Scoped<NoteHash> for ScopedNoteHash {
    fn inner(self) -> NoteHash {
        self.note_hash
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Ordered for ScopedNoteHash {
    fn counter(self) -> u32 {
        self.note_hash.counter
    }
}

impl OrderedValue<Field> for ScopedNoteHash {
    fn value(self) -> Field {
        self.note_hash.value
    }
}

impl Empty for ScopedNoteHash {
    fn empty() -> Self {
        ScopedNoteHash { note_hash: NoteHash::empty(), contract_address: AztecAddress::zero() }
    }
}

impl Readable<ScopedReadRequest> for ScopedNoteHash {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        assert_eq(
            self.note_hash.value,
            read_request.value(),
            "Value of the note hash does not match read request",
        );
        assert_eq(
            self.contract_address,
            read_request.contract_address,
            "Contract address of the note hash does not match read request",
        );
        assert(
            read_request.counter() > self.note_hash.counter,
            "Read request counter must be greater than the counter of the note hash",
        );
    }
}

impl ScopedNoteHash {
    pub fn expose_to_public(self) -> ScopedNoteHash {
        // Hide the actual counter when exposing it to the public kernel.
        NoteHash { value: self.note_hash.value, counter: 0 }.scope(AztecAddress::zero())
    }
}

mod tests {
    use crate::{
        abis::note_hash::{NoteHash, ScopedNoteHash},
        constants::{NOTE_HASH_LENGTH, SCOPED_NOTE_HASH_LENGTH},
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = NoteHash::empty();
        // We use the NOTE_HASH_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; NOTE_HASH_LENGTH] = item.serialize();
        let deserialized = NoteHash::deserialize(serialized);
        assert(item.eq(deserialized));
    }

    #[test]
    fn serialization_of_empty_scoped() {
        let item = ScopedNoteHash::empty();
        // We use the SCOPED_NOTE_HASH_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; SCOPED_NOTE_HASH_LENGTH] = item.serialize();
        let deserialized = ScopedNoteHash::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
