mod validate_against_call_request;
mod validate_against_previous_kernel;
mod validate_against_tx_request;
mod validate_arrays;
mod validate_as_first_call;
mod validate_call;
mod validate_call_requests;
mod validate_contract_address;
mod validate_counters;
mod validate_private_call_requests;

use crate::private_call_data_validator::PrivateCallDataValidator;
use dep::types::{
    abis::{private_kernel::private_call_data::PrivateCallData, private_call_request::ScopedPrivateCallRequest},
    tests::fixture_builder::FixtureBuilder, transaction::tx_request::TxRequest
};

struct PrivateCallDataValidatorBuilder {
    private_call: FixtureBuilder,
    first_revertible_private_call_request_index: u64,
}

impl PrivateCallDataValidatorBuilder {
    pub fn new() -> Self {
        let default_counter_start = 23;
        PrivateCallDataValidatorBuilder::new_from_counter(default_counter_start)
    }

    pub fn new_from_counter(counter: u32) -> Self {
        let private_call = FixtureBuilder::new_from_counter(counter);
        PrivateCallDataValidatorBuilder { private_call, first_revertible_private_call_request_index: 0 }
    }

    pub fn get_private_call_data(self) -> PrivateCallData {
        self.private_call.to_private_call_data()
    }

    pub fn is_delegate_call(&mut self) -> Self {
        let _ = self.private_call.is_delegate_call();
        *self
    }

    pub fn is_static_call(&mut self) -> Self {
        let _ = self.private_call.is_static_call();
        *self
    }

    pub fn validate(self) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate();
    }

    pub fn validate_as_first_call(self) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_as_first_call(self.first_revertible_private_call_request_index);
    }

    pub fn validate_against_tx_request(self, request: TxRequest) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_against_tx_request(request);
    }

    pub fn validate_against_call_request(self, request: ScopedPrivateCallRequest) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_against_call_request(request);
    }

    pub fn validate_with_private_call(private_call: PrivateCallData) {
        PrivateCallDataValidator::new(private_call).validate();
    }
}
