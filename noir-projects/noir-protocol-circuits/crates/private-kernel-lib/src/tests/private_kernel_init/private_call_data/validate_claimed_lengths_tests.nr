use crate::{
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
    tests::private_kernel_init::TestBuilder,
};
use types::{
    abis::private_circuit_public_inputs::PrivateCircuitPublicInputs,
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL,
        MAX_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
    },
};

impl TestBuilder {
    pub fn execute_with_private_call_and_fail(
        self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let mut private_call = self.private_call.to_private_call_data();
        private_call.public_inputs = private_call_public_inputs;

        let private_inputs = PrivateKernelInitCircuitPrivateInputs {
            tx_request: self.tx_request,
            private_call,
            vk_tree_root: self.private_call.vk_tree_root,
            protocol_contracts: self.private_call.protocol_contracts,
            is_private_only: self.is_private_only,
            first_nullifier_hint: self.first_nullifier_hint,
            revertible_counter_hint: self.revertible_counter_hint,
        };

        let _ = private_kernel_init::execute(private_inputs);
    }
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn note_hash_read_requests_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_note_hash_read_requests(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "nullifier_read_requests length out of bounds")]
fn nullifier_read_requests_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_nullifier_read_requests(MAX_NULLIFIER_READ_REQUESTS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "key_validation_requests_and_generators length out of bounds")]
fn key_validation_requests_and_generators_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_key_validation_requests(MAX_KEY_VALIDATION_REQUESTS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "note_hashes length out of bounds")]
fn note_hashes_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_note_hashes(MAX_NOTE_HASHES_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "nullifiers length out of bounds")]
fn nullifiers_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_nullifiers(MAX_NULLIFIERS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "private_call_requests length out of bounds")]
fn private_call_requests_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_private_call_requests(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "public_call_requests length out of bounds")]
fn public_call_requests_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_public_call_requests(MAX_ENQUEUED_CALLS_PER_CALL);

    let mut private_call = builder.private_call.to_private_circuit_public_inputs();
    private_call.public_call_requests.length += 1;

    builder.execute_with_private_call_and_fail(private_call);
}

#[test(should_fail_with = "l2_to_l1_msgs length out of bounds")]
fn l2_to_l1_msgs_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_CALL);

    let mut private_call = builder.private_call.to_private_circuit_public_inputs();
    private_call.l2_to_l1_msgs.length += 1;

    builder.execute_with_private_call_and_fail(private_call);
}

#[test(should_fail_with = "private_logs length out of bounds")]
fn private_logs_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_private_logs(MAX_PRIVATE_LOGS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "contract_class_logs_hashes length out of bounds")]
fn contract_class_logs_hashes_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_contract_class_logs(MAX_CONTRACT_CLASS_LOGS_PER_CALL);

    let mut private_call = builder.private_call.to_private_circuit_public_inputs();
    private_call.contract_class_logs_hashes.length += 1;

    builder.execute_with_private_call_and_fail(private_call);
}
