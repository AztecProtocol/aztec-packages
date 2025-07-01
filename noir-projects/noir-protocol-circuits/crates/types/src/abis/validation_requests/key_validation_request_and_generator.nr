use crate::{
    abis::validation_requests::{
        key_validation_request::KeyValidationRequest,
        scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
    },
    address::AztecAddress,
    constants::KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct KeyValidationRequestAndGenerator {
    pub request: KeyValidationRequest,
    pub sk_app_generator: Field,
}

impl Empty for KeyValidationRequestAndGenerator {
    fn empty() -> Self {
        KeyValidationRequestAndGenerator {
            request: KeyValidationRequest::empty(),
            sk_app_generator: 0,
        }
    }
}

impl KeyValidationRequestAndGenerator {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedKeyValidationRequestAndGenerator {
        ScopedKeyValidationRequestAndGenerator { request: self, contract_address }
    }
}

mod test {
    use crate::{
        abis::validation_requests::key_validation_request_and_generator::KeyValidationRequestAndGenerator,
        constants::KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_key_validation_request_and_generator() {
        let item = KeyValidationRequestAndGenerator::empty();
        // We use the KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH] = item.serialize();
        let deserialized = KeyValidationRequestAndGenerator::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
