use dep::std::cmp::Eq;
use crate::{
    address::AztecAddress, constants::SCOPED_KEY_VALIDATION_REQUEST_LENGTH,
    traits::{Empty, Serialize, Deserialize}, utils::{arrays::array_concat, reader::Reader}
};

struct ScopedKeyValidationRequest {
    request: KeyValidationRequest,
    contract_address: AztecAddress,
}

impl Eq for ScopedKeyValidationRequest {
    fn eq(self, other: ScopedKeyValidationRequest) -> bool {
        (self.request.eq(other.request))
            & (self.contract_address.eq(other.contract_address))
    }
}

impl Empty for ScopedKeyValidationRequest {
    fn empty() -> Self {
        ScopedKeyValidationRequest {
            request: KeyValidationRequest::empty(),
            contract_address: AztecAddress::zero(),
        }
    }
}

impl Serialize<SCOPED_KEY_VALIDATION_REQUEST_LENGTH> for ScopedKeyValidationRequest {
    fn serialize(self) -> [Field; SCOPED_KEY_VALIDATION_REQUEST_LENGTH] {
        array_concat(self.request.serialize(), [self.contract_address.to_field()])
    }
}

impl Deserialize<SCOPED_KEY_VALIDATION_REQUEST_LENGTH> for ScopedKeyValidationRequest {
    fn deserialize(fields: [Field; SCOPED_KEY_VALIDATION_REQUEST_LENGTH]) -> Self {
        let mut reader = Reader::new(fields);
        let res = Self {
            request: reader.read_struct(KeyValidationRequest::deserialize),
            contract_address: reader.read_struct(AztecAddress::deserialize),
        };
        reader.finish();
        res
    }
}

#[test]
fn serialization_of_empty() {
    let item = ScopedKeyValidationRequest::empty();
    let serialized = item.serialize();
    let deserialized = ScopedKeyValidationRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
