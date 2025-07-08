use crate::{
    abis::{
        side_effect::Scoped,
        validation_requests::key_validation_request_and_generator::KeyValidationRequestAndGenerator,
    },
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedKeyValidationRequestAndGenerator {
    pub request: KeyValidationRequestAndGenerator,
    pub contract_address: AztecAddress,
}

impl Scoped<KeyValidationRequestAndGenerator> for ScopedKeyValidationRequestAndGenerator {
    fn inner(self) -> KeyValidationRequestAndGenerator {
        self.request
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Empty for ScopedKeyValidationRequestAndGenerator {
    fn empty() -> Self {
        ScopedKeyValidationRequestAndGenerator {
            request: KeyValidationRequestAndGenerator::empty(),
            contract_address: AztecAddress::zero(),
        }
    }
}

mod test {
    use crate::{
        abis::validation_requests::{
            key_validation_request_and_generator::KeyValidationRequestAndGenerator,
            scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
        },
        address::AztecAddress,
        constants::SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH,
        traits::{Deserialize, Empty, FromField, Serialize},
    };

    #[test]
    fn test_scoped_key_validation_request_and_generator_serialization() {
        let item = ScopedKeyValidationRequestAndGenerator {
            request: KeyValidationRequestAndGenerator::empty(),
            contract_address: AztecAddress::from_field(123),
        };
        // We use the SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant
        let serialized: [Field; SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH] =
            item.serialize();
        let deserialized = ScopedKeyValidationRequestAndGenerator::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
