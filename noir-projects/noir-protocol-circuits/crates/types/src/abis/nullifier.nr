use crate::{
    abis::{read_request::ScopedReadRequest, side_effect::{Ordered, OrderedValue, Readable, Scoped}},
    address::AztecAddress,
    hash::compute_siloed_nullifier,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct Nullifier {
    pub value: Field,
    pub counter: u32,
    pub note_hash: Field, // Every nullifier tracks the note hash that it nullified, to enable squashing.
    // This note_hash is discarded before the tx is sent to public-land.
}

impl Ordered for Nullifier {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl OrderedValue<Field> for Nullifier {
    fn value(self) -> Field {
        self.value
    }
}

impl Empty for Nullifier {
    fn empty() -> Self {
        Nullifier { value: 0, counter: 0, note_hash: 0 }
    }
}

impl Readable<ScopedReadRequest> for Nullifier {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        // Public kernels output Nullifier instead of ScopedNullifier.
        // The nullifier value has been siloed.
        let siloed_request_value =
            compute_siloed_nullifier(read_request.contract_address, read_request.value());
        assert_eq(
            self.value,
            siloed_request_value,
            "Value of the nullifier does not match read request",
        );
        assert(
            read_request.counter() > self.counter,
            "Read request counter must be greater than the counter of the nullifier",
        );
    }
}

impl Nullifier {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedNullifier {
        ScopedNullifier { nullifier: self, contract_address }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedNullifier {
    pub nullifier: Nullifier,
    pub contract_address: AztecAddress,
}

impl Scoped<Nullifier> for ScopedNullifier {
    fn inner(self) -> Nullifier {
        self.nullifier
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Ordered for ScopedNullifier {
    fn counter(self) -> u32 {
        self.nullifier.counter
    }
}

impl OrderedValue<Field> for ScopedNullifier {
    fn value(self) -> Field {
        self.nullifier.value
    }
}

impl Empty for ScopedNullifier {
    fn empty() -> Self {
        ScopedNullifier { nullifier: Nullifier::empty(), contract_address: AztecAddress::empty() }
    }
}

impl Readable<ScopedReadRequest> for ScopedNullifier {
    fn assert_match_read_request(self, read_request: ScopedReadRequest) {
        assert_eq(
            self.nullifier.value,
            read_request.value(),
            "Value of the nullifier does not match read request",
        );
        assert_eq(
            self.contract_address,
            read_request.contract_address,
            "Contract address of the nullifier does not match read request",
        );
        assert(
            read_request.counter() > self.nullifier.counter,
            "Read request counter must be greater than the counter of the nullifier",
        );
    }
}

impl ScopedNullifier {
    pub fn nullified_note_hash(self) -> Field {
        self.nullifier.note_hash
    }

    pub fn expose_to_public(self) -> Nullifier {
        // Hide the actual counter and note hash when exposing it to the public kernel.
        Nullifier { value: self.nullifier.value, counter: 0, note_hash: 0 }
    }
}
