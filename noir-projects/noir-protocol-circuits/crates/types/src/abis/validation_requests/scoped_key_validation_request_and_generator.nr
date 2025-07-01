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
