use crate::{
    abis::validation_requests::key_validation_request::KeyValidationRequest,
    address::AztecAddress,
    side_effect::Scoped,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct KeyValidationRequestAndSeparator {
    pub request: KeyValidationRequest,
    pub key_type_domain_separator: Field,
}

impl Empty for KeyValidationRequestAndSeparator {
    fn empty() -> Self {
        KeyValidationRequestAndSeparator {
            request: KeyValidationRequest::empty(),
            key_type_domain_separator: 0,
        }
    }
}

impl KeyValidationRequestAndSeparator {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<KeyValidationRequestAndSeparator> {
        Scoped::new(self, contract_address)
    }
}

mod test {
    use crate::{
        abis::validation_requests::{
            key_validation_request::KeyValidationRequest,
            key_validation_request_and_separator::KeyValidationRequestAndSeparator,
        },
        constants::KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_key_validation_request_and_separator() {
        let non_empty_item = KeyValidationRequestAndSeparator {
            request: KeyValidationRequest { pk_m_hash: 123, sk_app: 789 },
            key_type_domain_separator: 789,
        };
        let serialized: [Field; KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH] =
            non_empty_item.serialize();
        let deserialized = KeyValidationRequestAndSeparator::deserialize(serialized);
        assert_eq(non_empty_item, deserialized);
    }
}
