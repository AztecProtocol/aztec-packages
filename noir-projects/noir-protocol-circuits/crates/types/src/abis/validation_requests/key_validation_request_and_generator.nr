use crate::{
    abis::validation_requests::{
        key_validation_request::KeyValidationRequest,
        scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
    },
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
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
        abis::validation_requests::{
            key_validation_request::KeyValidationRequest,
            key_validation_request_and_generator::KeyValidationRequestAndGenerator,
        },
        constants::KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH,
        point::Point,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_key_validation_request_and_generator() {
        let non_empty_item = KeyValidationRequestAndGenerator {
            request: KeyValidationRequest { pk_m: Point::deserialize([123, 456, 0]), sk_app: 789 },
            sk_app_generator: 789,
        };
        let serialized: [Field; KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH] =
            non_empty_item.serialize();
        let deserialized = KeyValidationRequestAndGenerator::deserialize(serialized);
        assert_eq(non_empty_item, deserialized);
    }
}
