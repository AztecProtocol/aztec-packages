use crate::{
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
    private_kernel_init_3::{self, PrivateKernelInit3CircuitPrivateInputs},
    private_kernel_inner::{self, PrivateKernelInnerCircuitPrivateInputs},
    private_kernel_inner_3::{self, PrivateKernelInner3CircuitPrivateInputs},
};
use protocol_test_utils::{assert_claimed_length_array_eq, FixtureBuilder};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelData, transaction::tx_request::TxRequest,
    },
    constants::{PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX},
};

fn private_kernel_data_with_vk_index(
    public_inputs: PrivateKernelCircuitPublicInputs,
    vk_index: u32,
) -> PrivateKernelData {
    let kernel_data = FixtureBuilder::new().in_vk_tree(vk_index).to_private_kernel_data();
    PrivateKernelData { public_inputs, vk_data: kernel_data.vk_data }
}

fn assert_private_kernel_public_inputs_eq(
    actual: PrivateKernelCircuitPublicInputs,
    expected: PrivateKernelCircuitPublicInputs,
) {
    assert_eq(actual.constants, expected.constants);
    assert_eq(
        actual.min_revertible_side_effect_counter,
        expected.min_revertible_side_effect_counter,
    );
    assert_eq(actual.end, expected.end);
    assert_eq(actual.validation_requests, expected.validation_requests);
    assert_eq(actual.public_teardown_call_request, expected.public_teardown_call_request);
    assert_eq(actual.fee_payer, expected.fee_payer);
    assert_eq(actual.expiration_timestamp, expected.expiration_timestamp);
    assert_eq(actual.is_private_only, expected.is_private_only);
    assert_eq(actual.claimed_first_nullifier, expected.claimed_first_nullifier);
    assert_eq(actual.claimed_revertible_counter, expected.claimed_revertible_counter);
}

fn execute_init_3_sequential(
    inputs: PrivateKernelInit3CircuitPrivateInputs,
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

    let output_1 = private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: private_kernel_data_with_vk_index(
                output_0,
                PRIVATE_KERNEL_INIT_VK_INDEX,
            ),
            private_call: inputs.private_call_1,
        },
    );

    private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: private_kernel_data_with_vk_index(
                output_1,
                PRIVATE_KERNEL_INNER_VK_INDEX,
            ),
            private_call: inputs.private_call_2,
        },
    )
}

fn execute_inner_3_sequential(
    inputs: PrivateKernelInner3CircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    let output_0 = private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: inputs.previous_kernel,
            private_call: inputs.private_call_0,
        },
    );

    let output_1 = private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: private_kernel_data_with_vk_index(
                output_0,
                PRIVATE_KERNEL_INNER_VK_INDEX,
            ),
            private_call: inputs.private_call_1,
        },
    );

    private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: private_kernel_data_with_vk_index(
                output_1,
                PRIVATE_KERNEL_INNER_VK_INDEX,
            ),
            private_call: inputs.private_call_2,
        },
    )
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

    fn execute_linear_chain_without_first_to_second_sync(self) -> PrivateKernelCircuitPublicInputs {
        let mut inputs = self.inputs_with_shape(false, true);
        inputs.private_call_0.public_inputs.private_call_requests.array[0].args_hash += 1;

        private_kernel_init_3::execute(inputs)
    }

    fn execute_depth_first_with_sibling(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(true, true)
    }

    fn execute_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        private_kernel_init_3::execute(self.inputs_with_shape(include_sibling, sync_second_to_third))
    }

    fn execute_sequential_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        execute_init_3_sequential(
            self.inputs_with_shape(include_sibling, sync_second_to_third),
        )
    }

    fn inputs_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelInit3CircuitPrivateInputs {
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

        PrivateKernelInit3CircuitPrivateInputs {
            tx_request: self.tx_request,
            private_call_0: private_call_0.to_private_call_data(),
            private_call_1: private_call_1.to_private_call_data(),
            private_call_2: private_call_2.to_private_call_data(),
            vk_tree_root: private_call_0.vk_tree_root,
            protocol_contracts: private_call_0.protocol_contracts,
            is_private_only: self.is_private_only,
            first_nullifier_hint: self.first_nullifier_hint,
            revertible_counter_hint: self.revertible_counter_hint,
        }
    }
}

struct Inner3TestBuilder {
    previous_kernel: FixtureBuilder,
    private_call_0: FixtureBuilder,
    private_call_1: FixtureBuilder,
    private_call_2: FixtureBuilder,
}

impl Inner3TestBuilder {
    fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new_from_counter(135)
            .in_vk_tree(PRIVATE_KERNEL_INIT_VK_INDEX)
            .as_parent_contract();
        previous_kernel.compute_update_tree_and_hints();

        let mut private_call_0 = FixtureBuilder::new_from_counter(1000);
        private_call_0.anchor_block_header = previous_kernel.anchor_block_header;
        private_call_0.tx_context = previous_kernel.tx_context;
        private_call_0.compute_update_tree_and_hints();

        let mut private_call_1 = FixtureBuilder::new_from_counter(2000);
        private_call_1.anchor_block_header = previous_kernel.anchor_block_header;
        private_call_1.tx_context = previous_kernel.tx_context;
        private_call_1.compute_update_tree_and_hints();

        let mut private_call_2 = FixtureBuilder::new_from_counter(3000);
        private_call_2.anchor_block_header = previous_kernel.anchor_block_header;
        private_call_2.tx_context = previous_kernel.tx_context;
        private_call_2.compute_update_tree_and_hints();

        Inner3TestBuilder { previous_kernel, private_call_0, private_call_1, private_call_2 }
    }

    fn execute_linear_chain(self) -> PrivateKernelCircuitPublicInputs {
        private_kernel_inner_3::execute(self.linear_chain_inputs())
    }

    fn execute_linear_chain_sequential(self) -> PrivateKernelCircuitPublicInputs {
        execute_inner_3_sequential(self.linear_chain_inputs())
    }

    fn linear_chain_inputs(self) -> PrivateKernelInner3CircuitPrivateInputs {
        let mut previous_kernel = self.previous_kernel;
        let mut private_call_0 = self.private_call_0;
        let mut private_call_1 = self.private_call_1;
        let mut private_call_2 = self.private_call_2;

        private_call_0.add_private_call_request();
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

        private_call_1.private_call_requests.set(0, private_call_2.to_private_call_request());
        if private_call_1.counter <= private_call_2.counter {
            private_call_1.counter = private_call_2.counter + 1;
        }

        private_call_0.private_call_requests.set(0, private_call_1.to_private_call_request());
        if private_call_0.counter <= private_call_1.counter {
            private_call_0.counter = private_call_1.counter + 1;
        }

        previous_kernel.private_call_requests.push(private_call_0.to_private_call_request());

        PrivateKernelInner3CircuitPrivateInputs {
            previous_kernel: previous_kernel.to_private_kernel_data(),
            private_call_0: private_call_0.to_private_call_data(),
            private_call_1: private_call_1.to_private_call_data(),
            private_call_2: private_call_2.to_private_call_data(),
        }
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
fn batch_3_linear_chain_matches_sequential_kernels() {
    let builder = Batch3TestBuilder::new();

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

#[test]
fn batch_3_depth_first_child_keeps_sibling_on_stack() {
    let builder = Batch3TestBuilder::new();

    let output = builder.execute_depth_first_with_sibling();

    assert_eq(output.end.private_call_stack.length, 1);
}

#[test]
fn batch_3_depth_first_with_sibling_matches_sequential_kernels() {
    let builder = Batch3TestBuilder::new();

    let batched = builder.execute_depth_first_with_sibling();
    let sequential = builder.execute_sequential_with_shape(true, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

#[test(should_fail_with = "call_context does not match call request")]
fn batch_3_third_call_must_match_second_call_stack_fails() {
    let builder = Batch3TestBuilder::new();

    let _ = builder.execute_linear_chain_without_second_to_third_sync();
}

#[test(should_fail_with = "args_hash does not match call request")]
fn batch_3_second_call_must_match_first_call_stack_fails() {
    let builder = Batch3TestBuilder::new();

    let _ = builder.execute_linear_chain_without_first_to_second_sync();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_3_fee_payer_conflict_fails() {
    let mut builder = Batch3TestBuilder::new();

    builder.private_call_0.is_fee_payer = true;
    builder.private_call_1.is_fee_payer = true;

    let _ = builder.execute_linear_chain();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn batch_3_public_teardown_conflict_fails() {
    let mut builder = Batch3TestBuilder::new();

    builder.private_call_0.set_public_teardown_call_request();
    builder.private_call_1.set_public_teardown_call_request();

    let _ = builder.execute_linear_chain();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn batch_3_min_revertible_side_effect_counter_conflict_fails() {
    let mut builder = Batch3TestBuilder::new();

    builder.private_call_0.end_setup();
    builder.private_call_1.end_setup();
    builder.revertible_counter_hint = builder.private_call_0.min_revertible_side_effect_counter;

    let _ = builder.execute_linear_chain();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn batch_3_static_call_requires_static_nested_private_call_fails() {
    let mut builder = Batch3TestBuilder::new();

    let _ = builder.private_call_1.is_static_call();

    let _ = builder.execute_linear_chain();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn batch_3_static_call_restrictions_apply_to_next_slot_fails() {
    let mut builder = Batch3TestBuilder::new();

    let _ = builder.private_call_1.is_static_call();
    let _ = builder.private_call_2.is_static_call();
    builder.private_call_2.append_note_hashes(1);

    let _ = builder.execute_linear_chain();
}

#[test]
fn inner_3_accumulates_side_effects_after_previous_kernel() {
    let mut builder = Inner3TestBuilder::new();

    builder.previous_kernel.append_note_hashes(1);
    builder.private_call_0.append_note_hashes(1);
    builder.private_call_1.append_note_hashes(1);
    builder.private_call_2.append_note_hashes(1);

    let previous_note_hashes = builder.previous_kernel.note_hashes.storage();
    let call_0_note_hashes = builder.private_call_0.note_hashes.storage();
    let call_1_note_hashes = builder.private_call_1.note_hashes.storage();
    let call_2_note_hashes = builder.private_call_2.note_hashes.storage();

    let output = builder.execute_linear_chain();

    assert_claimed_length_array_eq(
        output.end.note_hashes,
        [
            previous_note_hashes[0],
            call_0_note_hashes[0],
            call_1_note_hashes[0],
            call_2_note_hashes[0],
        ],
    );
}

#[test]
fn inner_3_with_previous_side_effects_matches_sequential_kernels() {
    let mut builder = Inner3TestBuilder::new();

    builder.previous_kernel.append_note_hashes(1);
    builder.private_call_0.append_note_hashes(1);
    builder.private_call_1.append_note_hashes(1);
    builder.private_call_2.append_note_hashes(1);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

#[test]
fn inner_3_linear_chain_consumes_all_calls() {
    let builder = Inner3TestBuilder::new();

    let output = builder.execute_linear_chain();

    assert_eq(output.end.private_call_stack.length, 0);
}

#[test]
fn inner_3_linear_chain_matches_sequential_kernels() {
    let builder = Inner3TestBuilder::new();

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}
