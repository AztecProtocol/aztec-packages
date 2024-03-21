use dep::types::{
    abis::{
    private_circuit_public_inputs::PrivateCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData
},
    utils::arrays::validate_array
};

struct PrivateCallValidator {
    private_call: PrivateCallData,
}

impl PrivateCallValidator {
    pub fn validate(self) {
        self.validate_arrays();
    }

    fn validate_arrays(self) {
        let public_inputs = self.private_call.call_stack_item.public_inputs;

        // Each of the following arrays is expected to be zero-padded.
        // In addition, some of the following arrays (new_note_hashes, etc...) are passed
        // to extend_from_array_to_array() routines which rely on the passed arrays to be well-formed.

        validate_array(public_inputs.return_values);
        validate_array(public_inputs.note_hash_read_requests);
        validate_array(public_inputs.nullifier_read_requests);
        validate_array(public_inputs.nullifier_key_validation_requests);
        validate_array(public_inputs.new_note_hashes);
        validate_array(public_inputs.new_nullifiers);
        validate_array(public_inputs.private_call_stack_hashes);
        validate_array(public_inputs.public_call_stack_hashes);
        validate_array(public_inputs.new_l2_to_l1_msgs);
        // encrypted_logs_hash and unencrypted_logs_hash have their own integrity checks.
    }

    fn validate_call_against_request(self, request: CallRequest) {
        let call_stack_item = self.private_call.call_stack_item;
        assert(
            request.hash == call_stack_item.hash(), "calculated private_call_hash does not match provided private_call_hash at the top of the call stack"
        );

        let call_context = call_stack_item.public_inputs.call_context;

        // Ensures that if the function is internal, only the contract itself can call it.
        if call_stack_item.function_data.is_internal {
            assert(
                call_context.msg_sender.eq(call_context.storage_contract_address), "call is internal but msg_sender is not self"
            );
        }

        if call_context.is_delegate_call {
            let caller_context = request.caller_context;
            assert(!caller_context.is_empty(), "caller context cannot be empty for delegate calls");
            assert(
                call_context.msg_sender.eq(caller_context.msg_sender), "call stack msg_sender does not match expected msg_sender for delegate calls"
            );
            assert(
                call_context.storage_contract_address.eq(caller_context.storage_contract_address), "call stack storage address does not match expected contract address for delegate calls"
            );
            assert(
                !call_stack_item.contract_address.eq(call_context.storage_contract_address), "curent contract address must not match storage contract address for delegate calls"
            );
        } else {
            let caller_contract_address = request.caller_contract_address;
            assert(
                call_context.msg_sender.eq(caller_contract_address), "call stack msg_sender does not match caller contract address"
            );
            assert(
                call_context.storage_contract_address.eq(call_stack_item.contract_address), "call stack storage address does not match expected contract address"
            );
        }
    }
}
