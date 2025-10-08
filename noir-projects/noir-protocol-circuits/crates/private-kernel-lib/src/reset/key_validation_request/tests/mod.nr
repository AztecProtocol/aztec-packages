mod key_validation_request_validator_tests;

use super::{
    get_propagated_key_validation_requests::get_propagated_key_validation_requests,
    key_validation_hint::KeyValidationHint,
    key_validation_requests_validator::KeyValidationRequestsValidator,
};
use dep::types::{
    abis::validation_requests::{
        KeyValidationRequest, KeyValidationRequestAndGenerator,
        ScopedKeyValidationRequestAndGenerator,
    },
    address::AztecAddress,
    hash::compute_app_secret_key,
    scalar::Scalar,
    traits::{Empty, FromField},
    utils::arrays::ClaimedLengthArray,
};
use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;

global TEST_READ_REQUEST_LEN: u32 = 6;
global TEST_HINT_LEN: u32 = 2;

struct TestBuilder {
    key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, TEST_READ_REQUEST_LEN>,
    propagated_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, TEST_READ_REQUEST_LEN>,
    hints: BoundedVec<KeyValidationHint, TEST_HINT_LEN>,
}

impl TestBuilder {
    pub fn empty() -> Self {
        Self {
            key_validation_requests: ClaimedLengthArray::empty(),
            propagated_requests: ClaimedLengthArray::empty(),
            hints: BoundedVec::new(),
        }
    }

    pub fn new_clear_all() -> Self {
        let mut builder = Self::empty();

        builder.add_request_and_hint(11);
        builder.add_request_and_hint(22);
        builder.propagated_requests = builder.get_propagated_key_validation_requests();

        builder
    }

    pub fn new_clear_partial() -> Self {
        let mut builder = Self::empty();

        builder.add_request_and_hint(11);
        builder.add_request_and_hint(22);
        builder.add_request(33);
        builder.add_request(44);
        builder.propagated_requests = builder.get_propagated_key_validation_requests();

        builder
    }

    pub fn new_clear_nothing() -> Self {
        let mut builder = Self::empty();

        builder.add_request_and_hint(11);
        builder.add_request_and_hint(22);
        builder.propagated_requests = builder.key_validation_requests;

        builder
    }

    pub fn add_request(&mut self, sk: Field) {
        let contract_address = AztecAddress::from_field(456654);

        let sk_m = Scalar::from_field(sk);
        let pk_m = derive_public_key(sk_m);

        let sk_app_generator = 123321;
        let sk_app = compute_app_secret_key(sk_m, contract_address, sk_app_generator);

        let request = KeyValidationRequestAndGenerator {
            request: KeyValidationRequest { pk_m, sk_app },
            sk_app_generator,
        }
            .scope(contract_address);

        self.key_validation_requests.push(request);
    }

    pub fn add_hint(&mut self, sk: Field) {
        self.hints.push(KeyValidationHint { sk_m: Scalar::from_field(sk) });
    }

    pub fn add_request_and_hint(&mut self, sk: Field) {
        self.add_request(sk);
        self.add_hint(sk);
    }

    pub fn get_propagated_key_validation_requests(
        self,
    ) -> ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, TEST_READ_REQUEST_LEN> {
        let key_validation_amount = self.hints.len();
        // Safety: This is only used in tests.
        unsafe {
            get_propagated_key_validation_requests(
                self.key_validation_requests,
                key_validation_amount,
            )
        }
    }

    pub fn validate(self) {
        self.validate_with_amount::<TEST_HINT_LEN>();
    }

    pub fn validate_with_amount<let KeyValidationAmount: u32>(self) {
        KeyValidationRequestsValidator {
            key_validation_requests: self.key_validation_requests,
            hints: self.hints.storage(),
            propagated_requests: self.propagated_requests,
        }
            .validate::<KeyValidationAmount>();
    }
}
