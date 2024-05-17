use dep::std::cmp::Eq;
use crate::{
    address::AztecAddress,
    constants::{SCOPED_KEY_VALIDATION_REQUEST_LENGTH, KEY_VALIDATION_REQUEST_LENGTH},
    traits::{Empty, Serialize, Deserialize}, grumpkin_point::GrumpkinPoint,
    utils::{arrays::array_concat, reader::Reader}
};

struct KeyValidationRequest {
    master_nullifier_public_key: GrumpkinPoint,
    app_nullifier_secret_key: Field, // not a grumpkin scalar because it's output of poseidon2
}

impl Eq for KeyValidationRequest {
    fn eq(self, request: KeyValidationRequest) -> bool {
        (request.master_nullifier_public_key.eq(self.master_nullifier_public_key))
            & (request.app_nullifier_secret_key.eq(self.app_nullifier_secret_key))
    }
}

impl Empty for KeyValidationRequest {
    fn empty() -> Self {
        KeyValidationRequest {
            master_nullifier_public_key: GrumpkinPoint::zero(),
            app_nullifier_secret_key: 0,
        }
    }
}

impl Serialize<KEY_VALIDATION_REQUEST_LENGTH> for KeyValidationRequest {
    fn serialize(self) -> [Field; KEY_VALIDATION_REQUEST_LENGTH] {
        [
            self.master_nullifier_public_key.x,
            self.master_nullifier_public_key.y,
            self.app_nullifier_secret_key,
        ]
    }
}

impl Deserialize<KEY_VALIDATION_REQUEST_LENGTH> for KeyValidationRequest {
    fn deserialize(fields: [Field; KEY_VALIDATION_REQUEST_LENGTH]) -> Self {
        Self {
            master_nullifier_public_key: GrumpkinPoint::new(fields[0], fields[1]),
            app_nullifier_secret_key: fields[2],
        }
    }
}

impl KeyValidationRequest {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedKeyValidationRequest {
        ScopedKeyValidationRequest { request: self, contract_address }
    }
}

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

