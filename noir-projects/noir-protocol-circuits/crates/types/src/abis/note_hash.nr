use crate::{
    abis::read_request::ReadRequestContext, address::AztecAddress,
    abis::side_effect::{Ordered, Readable}, constants::{NOTE_HASH_LENGTH, NOTE_HASH_CONTEXT_LENGTH},
    traits::{Empty, Serialize, Deserialize}
};
use dep::std::cmp::Eq;

struct NoteHash {
    value: Field,
    counter: u32,
}

impl Eq for NoteHash {
    fn eq(self, other: NoteHash) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter) 
    }
}

impl Empty for NoteHash {
    fn empty() -> Self {
        NoteHash {
            value: 0,
            counter: 0,
        }
    }
}

impl Serialize<NOTE_HASH_LENGTH> for NoteHash {
    fn serialize(self) -> [Field; NOTE_HASH_LENGTH] {
        [self.value, self.counter as Field]
    }
}

impl Deserialize<NOTE_HASH_LENGTH> for NoteHash {
    fn deserialize(values: [Field; NOTE_HASH_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
        }
    }
}

impl NoteHash {
    pub fn to_context(self, nullifier_counter: u32, contract_address: AztecAddress) -> NoteHashContext {
        NoteHashContext { value: self.value, counter: self.counter, nullifier_counter, contract_address }
    }
}

struct NoteHashContext {
    value: Field,
    counter: u32,
    nullifier_counter: u32,
    contract_address: AztecAddress,
}

impl Ordered for NoteHashContext {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for NoteHashContext {
    fn eq(self, other: NoteHashContext) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter) 
            & (self.nullifier_counter == other.nullifier_counter)
            & (self.contract_address == other.contract_address)
    }
}

impl Empty for NoteHashContext {
    fn empty() -> Self {
        NoteHashContext {
            value: 0,
            counter: 0,
            nullifier_counter: 0,
            contract_address: AztecAddress::zero(),
        }
    }
}

impl Serialize<NOTE_HASH_CONTEXT_LENGTH> for NoteHashContext {
    fn serialize(self) -> [Field; NOTE_HASH_CONTEXT_LENGTH] {
        [self.value, self.counter as Field, self.nullifier_counter as Field, self.contract_address.to_field()]
    }
}

impl Deserialize<NOTE_HASH_CONTEXT_LENGTH> for NoteHashContext {
    fn deserialize(values: [Field; NOTE_HASH_CONTEXT_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
            nullifier_counter: values[2] as u32,
            contract_address: AztecAddress::from_field(values[3]),
        }
    }
}

impl Readable for NoteHashContext {
    fn assert_match_read_request(self, read_request: ReadRequestContext) {
        assert_eq(self.value, read_request.value, "Value of the note hash does not match read request");
        assert_eq(self.contract_address, read_request.contract_address, "Contract address of the note hash does not match read request");
        assert(
            read_request.counter > self.counter, "Read request counter must be greater than the counter of the note hash"
        );
        assert(
            (self.nullifier_counter == 0) | (read_request.counter < self.nullifier_counter), "Read request counter must be less than the nullifier counter of the note hash"
        );
    }
}

impl NoteHashContext {
    pub fn expose_to_public(self) -> NoteHash {
        // Hide the actual counter when exposing it to the public kernel.
        NoteHash { value: self.value, counter: 0 }
    }
}
