use crate::{
    abis::{side_effect::{Ordered, OrderedValue, Readable}, read_request::{ReadRequest, ReadRequestContext}},
    address::AztecAddress, constants::{NULLIFIER_CONTEXT_LENGTH, NULLIFIER_LENGTH},
    hash::silo_nullifier, traits::{Empty, Hash, Serialize, Deserialize}
};

struct Nullifier {
    value: Field,
    counter: u32,
    note_hash: Field,
}

impl OrderedValue<Field> for Nullifier {
    fn value(self) -> Field {
        self.value
    }
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for Nullifier {
    fn eq(self, other: Nullifier) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter)
            & (self.note_hash == other.note_hash) 
    }
}

impl Empty for Nullifier {
    fn empty() -> Self {
        Nullifier {
            value: 0,
            counter: 0,
            note_hash: 0,
        }
    }
}

impl Serialize<NULLIFIER_LENGTH> for Nullifier {
    fn serialize(self) -> [Field; NULLIFIER_LENGTH] {
        [self.value, self.counter as Field, self.note_hash]
    }
}

impl Deserialize<NULLIFIER_LENGTH> for Nullifier {
    fn deserialize(values: [Field; NULLIFIER_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
            note_hash: values[2],
        }
    }
}

impl Readable for Nullifier {
    fn assert_match_read_request(self, read_request: ReadRequestContext) {
        // Public kernels output Nullifier instead of NullifierContext.
        // The nullifier value has been siloed.
        let siloed_request_value = silo_nullifier(read_request.contract_address, read_request.value);
        assert_eq(self.value, siloed_request_value, "Value of the nullifier does not match read request");
        assert(
            read_request.counter > self.counter, "Read request counter must be greater than the counter of the nullifier"
        );
    }
}

impl Nullifier {
    pub fn to_context(self, contract_address: AztecAddress) -> NullifierContext {
        NullifierContext { value: self.value, counter: self.counter, note_hash: self.note_hash, contract_address }
    }
}

struct NullifierContext {
    value: Field,
    counter: u32,
    note_hash: Field,
    contract_address: AztecAddress,
}

impl Ordered for NullifierContext {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl OrderedValue<Field> for NullifierContext {
    fn value(self) -> Field {
        self.value
    }
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for NullifierContext {
    fn eq(self, other: NullifierContext) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter)
            & (self.note_hash == other.note_hash) 
            & (self.contract_address == other.contract_address) 
    }
}

impl Empty for NullifierContext {
    fn empty() -> Self {
        NullifierContext {
            value: 0,
            counter: 0,
            note_hash: 0,
            contract_address: AztecAddress::empty(),
        }
    }
}

impl Serialize<NULLIFIER_CONTEXT_LENGTH> for NullifierContext {
    fn serialize(self) -> [Field; NULLIFIER_CONTEXT_LENGTH] {
        [self.value, self.counter as Field, self.note_hash, self.contract_address.to_field()]
    }
}

impl Deserialize<NULLIFIER_CONTEXT_LENGTH> for NullifierContext {
    fn deserialize(values: [Field; NULLIFIER_CONTEXT_LENGTH]) -> Self {
        Self {
            value: values[0],
            counter: values[1] as u32,
            note_hash: values[2],
            contract_address: AztecAddress::from_field(values[3]),
        }
    }
}

impl Readable for NullifierContext {
    fn assert_match_read_request(self, read_request: ReadRequestContext) {
        assert_eq(self.value, read_request.value, "Value of the nullifier does not match read request");
        assert_eq(self.contract_address, read_request.contract_address, "Contract address of the nullifier does not match read request");
        assert(
            read_request.counter > self.counter, "Read request counter must be greater than the counter of the nullifier"
        );
    }
}

impl NullifierContext {
    pub fn expose_to_public(self) -> Nullifier {
        // Hide the actual counter and note hash when exposing it to the public kernel.
        Nullifier { value: self.value, counter: 0, note_hash: 0 }
    }
}
