use crate::{
    components::{
        private_call_data_validator::PrivateCallDataValidator,
        private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
        private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    },
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
};
use protocol_test_utils::{assert_claimed_length_array_eq, FixtureBuilder};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
    transaction::tx_request::TxRequest,
};

struct PrivateKernelBatch3CircuitPrivateInputs {
    tx_request: TxRequest,
    private_call_0: PrivateCallData,
    private_call_1: PrivateCallData,
    private_call_2: PrivateCallData,
    vk_tree_root: Field,
    protocol_contracts: ProtocolContracts,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
}

unconstrained fn generate_next_output(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_previous_kernel(previous_kernel)
        .pop_top_call_request()
        .with_private_call(private_call)
        .finish()
}

fn execute_next_private_call(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateCallDataValidator::new(private_call).validate_as_inner_call(previous_kernel);

    let output = unsafe { generate_next_output(previous_kernel, private_call) };
    PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
        previous_kernel,
        private_call,
    );

    output
}

fn execute_three_private_calls(
    inputs: PrivateKernelBatch3CircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    let output_0 = private_kernel_init::execute(
        PrivateKernelInitCircuitPrivateInputs {
            tx_request: inputs.tx_request,
            private_call: inputs.private_call_0,
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            is_private_only: inputs.is_private_only,
            first_nullifier_hint: inputs.first_nullifier_hint,
            revertible_counter_hint: inputs.revertible_counter_hint,
        },
    );

    let output_1 = execute_next_private_call(output_0, inputs.private_call_1);
    execute_next_private_call(output_1, inputs.private_call_2)
}

struct Batch3TestBuilder {
    tx_request: TxRequest,
    private_call_0: FixtureBuilder,
    private_call_1: FixtureBuilder,
    private_call_2: FixtureBuilder,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
}

impl Batch3TestBuilder {
    fn new() -> Self {
        let mut private_call_0 = FixtureBuilder::new_from_counter(2).is_first_call();
        private_call_0.compute_update_tree_and_hints();

        let mut private_call_1 = FixtureBuilder::new_from_counter(1000);
        private_call_1.anchor_block_header = private_call_0.anchor_block_header;
        private_call_1.tx_context = private_call_0.tx_context;
        private_call_1.compute_update_tree_and_hints();

        let mut private_call_2 = FixtureBuilder::new_from_counter(2000);
        private_call_2.anchor_block_header = private_call_0.anchor_block_header;
        private_call_2.tx_context = private_call_0.tx_context;
        private_call_2.compute_update_tree_and_hints();

        let tx_request = private_call_0.to_tx_request();

        Batch3TestBuilder {
            tx_request,
            private_call_0,
            private_call_1,
            private_call_2,
            is_private_only: false,
            first_nullifier_hint: 123,
            revertible_counter_hint: 0,
        }
    }

    fn execute_linear_chain(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(false, true)
    }

    fn execute_linear_chain_without_second_to_third_sync(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(false, false)
    }

    fn execute_depth_first_with_sibling(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(true, true)
    }

    fn execute_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        let mut private_call_0 = self.private_call_0;
        let mut private_call_1 = self.private_call_1;
        let mut private_call_2 = self.private_call_2;

        if include_sibling {
            private_call_0.append_private_call_requests(2);
        } else {
            private_call_0.add_private_call_request();
        }

        let call_1_request = private_call_0.private_call_requests.get(0);
        private_call_1.msg_sender = private_call_0.contract_address;
        private_call_1.counter_start = call_1_request.start_side_effect_counter;
        if private_call_1.counter <= call_1_request.start_side_effect_counter {
            private_call_1.counter = call_1_request.start_side_effect_counter + 1;
        }

        private_call_1.add_private_call_request();
        let call_2_request = private_call_1.private_call_requests.get(0);
        private_call_2.msg_sender = private_call_1.contract_address;
        private_call_2.counter_start = call_2_request.start_side_effect_counter;
        if private_call_2.counter <= call_2_request.start_side_effect_counter {
            private_call_2.counter = call_2_request.start_side_effect_counter + 1;
        }

        if sync_second_to_third {
            private_call_1.private_call_requests.set(0, private_call_2.to_private_call_request());
        }
        if private_call_1.counter <= private_call_2.counter {
            private_call_1.counter = private_call_2.counter + 1;
        }

        private_call_0.private_call_requests.set(0, private_call_1.to_private_call_request());

        if include_sibling {
            let mut sibling_request = private_call_0.private_call_requests.get(1);
            sibling_request.start_side_effect_counter = private_call_1.counter + 1;
            sibling_request.end_side_effect_counter = sibling_request.start_side_effect_counter + 1;
            private_call_0.private_call_requests.set(1, sibling_request);
        }

        if private_call_0.counter <= private_call_1.counter {
            private_call_0.counter = private_call_1.counter + 1;
        }
        if include_sibling {
            let sibling_request = private_call_0.private_call_requests.get(1);
            if private_call_0.counter <= sibling_request.end_side_effect_counter {
                private_call_0.counter = sibling_request.end_side_effect_counter + 1;
            }
        }

        let inputs = PrivateKernelBatch3CircuitPrivateInputs {
            tx_request: self.tx_request,
            private_call_0: private_call_0.to_private_call_data(),
            private_call_1: private_call_1.to_private_call_data(),
            private_call_2: private_call_2.to_private_call_data(),
            vk_tree_root: private_call_0.vk_tree_root,
            protocol_contracts: private_call_0.protocol_contracts,
            is_private_only: self.is_private_only,
            first_nullifier_hint: self.first_nullifier_hint,
            revertible_counter_hint: self.revertible_counter_hint,
        };
        execute_three_private_calls(inputs)
    }
}

#[test]
fn batch_3_accumulates_side_effects_across_slots() {
    let mut builder = Batch3TestBuilder::new();

    builder.private_call_0.append_note_hashes(1);
    builder.private_call_1.append_note_hashes(1);
    builder.private_call_2.append_note_hashes(1);
    builder.private_call_0.append_l2_to_l1_msgs(1);
    builder.private_call_1.append_l2_to_l1_msgs(1);
    builder.private_call_2.append_l2_to_l1_msgs(1);

    let call_0_note_hashes = builder.private_call_0.note_hashes.storage();
    let call_1_note_hashes = builder.private_call_1.note_hashes.storage();
    let call_2_note_hashes = builder.private_call_2.note_hashes.storage();
    let call_0_l2_to_l1_msgs = builder.private_call_0.l2_to_l1_msgs.storage();
    let call_1_l2_to_l1_msgs = builder.private_call_1.l2_to_l1_msgs.storage();
    let call_2_l2_to_l1_msgs = builder.private_call_2.l2_to_l1_msgs.storage();

    let output = builder.execute_linear_chain();

    assert_claimed_length_array_eq(
        output.end.note_hashes,
        [call_0_note_hashes[0], call_1_note_hashes[0], call_2_note_hashes[0]],
    );
    assert_eq(
        output.end.note_hashes.array[0].contract_address,
        builder.private_call_0.contract_address,
    );
    assert_eq(
        output.end.note_hashes.array[1].contract_address,
        builder.private_call_1.contract_address,
    );
    assert_eq(
        output.end.note_hashes.array[2].contract_address,
        builder.private_call_2.contract_address,
    );

    assert_claimed_length_array_eq(
        output.end.l2_to_l1_msgs,
        [call_0_l2_to_l1_msgs[0], call_1_l2_to_l1_msgs[0], call_2_l2_to_l1_msgs[0]],
    );
}

#[test]
fn batch_3_linear_chain_consumes_all_calls() {
    let builder = Batch3TestBuilder::new();

    let output = builder.execute_linear_chain();

    assert_eq(output.end.private_call_stack.length, 0);
}

#[test]
fn batch_3_depth_first_child_keeps_sibling_on_stack() {
    let builder = Batch3TestBuilder::new();

    let output = builder.execute_depth_first_with_sibling();

    assert_eq(output.end.private_call_stack.length, 1);
}

#[test(should_fail_with = "call_context does not match call request")]
fn batch_3_third_call_must_match_second_call_stack_fails() {
    let builder = Batch3TestBuilder::new();

    builder.execute_linear_chain_without_second_to_third_sync();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_3_fee_payer_conflict_fails() {
    let mut builder = Batch3TestBuilder::new();

    builder.private_call_0.is_fee_payer = true;
    builder.private_call_1.is_fee_payer = true;

    builder.execute_linear_chain();
}
