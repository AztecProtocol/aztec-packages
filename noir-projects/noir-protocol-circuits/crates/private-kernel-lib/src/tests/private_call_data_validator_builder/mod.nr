mod validate_against_call_request;
mod validate_against_previous_kernel;
mod validate_against_tx_request;
mod validate_arrays;
mod validate_as_first_call;
mod restrict_side_effects;
mod validate_call_requests;
mod validate_contract_address;
mod validate_counters;
mod validate_log_lengths;
mod validate_private_call_requests;
mod verify_proof;

use crate::components::private_call_data_validator::PrivateCallDataValidator;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash, private_call_request::PrivateCallRequest,
        private_kernel::private_call_data::PrivateCallData,
    },
    tests::fixture_builder::FixtureBuilder,
    transaction::tx_request::TxRequest,
};

pub struct PrivateCallDataValidatorBuilder {
    private_call: FixtureBuilder,
    previous_note_hashes: BoundedVec<ScopedNoteHash, 4>,
}

impl PrivateCallDataValidatorBuilder {
    pub fn new() -> Self {
        let default_counter_start = 23;
        PrivateCallDataValidatorBuilder::new_from_counter(default_counter_start)
    }

    pub fn new_from_counter(counter: u32) -> Self {
        let mut private_call = FixtureBuilder::new_from_counter(counter);
        private_call.compute_update_tree_and_hints();

        let previous_note_hashes = BoundedVec::new();
        PrivateCallDataValidatorBuilder { private_call, previous_note_hashes }
    }

    pub fn is_static_call(&mut self) -> Self {
        let _ = self.private_call.is_static_call();
        *self
    }

    pub fn is_first_call(&mut self) -> Self {
        let _ = self.private_call.is_first_call();
        *self
    }

    pub fn get_private_call_data(self) -> PrivateCallData {
        self.private_call.to_private_call_data()
    }

    pub fn validate(self) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_common(
            self.private_call.protocol_contract_tree_root,
        );
    }

    pub fn validate_as_first_call(self) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_as_first_call();
    }

    pub fn validate_against_tx_request(self, request: TxRequest) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_against_tx_request(request);
    }

    pub fn validate_against_call_request(self, request: PrivateCallRequest) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_against_call_request(request);
    }

    pub fn verify_proof(self, is_first_call: bool) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).verify_proof(is_first_call);
    }
}
