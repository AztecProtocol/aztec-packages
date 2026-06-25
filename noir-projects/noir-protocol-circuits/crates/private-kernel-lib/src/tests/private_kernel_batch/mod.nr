use crate::{
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
    private_kernel_init_n::{self, PrivateKernelInitNCircuitPrivateInputs},
    private_kernel_inner::{self, PrivateKernelInnerCircuitPrivateInputs},
    private_kernel_inner_n::{self, PrivateKernelInnerNCircuitPrivateInputs},
};
use protocol_test_utils::FixtureBuilder;
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelData, transaction::tx_request::TxRequest,
    },
    constants::{
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, PRIVATE_KERNEL_INIT_VK_INDEX,
        PRIVATE_KERNEL_INNER_VK_INDEX,
    },
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
    assert_eq(actual.claimed_revertible_counter, expected.claimed_revertible_counter);
}

fn execute_init_n_sequential<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    let mut output = private_kernel_init::execute(
        PrivateKernelInitCircuitPrivateInputs {
            tx_request: inputs.tx_request,
            private_call: inputs.private_calls[0],
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            is_private_only: inputs.is_private_only,
            first_nullifier_hint: inputs.first_nullifier_hint,
            revertible_counter_hint: inputs.revertible_counter_hint,
        },
    );

    for i in 1..N {
        let vk_index = if i == 1 {
            PRIVATE_KERNEL_INIT_VK_INDEX
        } else {
            PRIVATE_KERNEL_INNER_VK_INDEX
        };
        output = private_kernel_inner::execute(
            PrivateKernelInnerCircuitPrivateInputs {
                previous_kernel: private_kernel_data_with_vk_index(output, vk_index),
                private_call: inputs.private_calls[i],
            },
        );
    }

    output
}

fn execute_inner_n_sequential<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    let mut output = private_kernel_inner::execute(
        PrivateKernelInnerCircuitPrivateInputs {
            previous_kernel: inputs.previous_kernel,
            private_call: inputs.private_calls[0],
        },
    );

    for i in 1..N {
        output = private_kernel_inner::execute(
            PrivateKernelInnerCircuitPrivateInputs {
                previous_kernel: private_kernel_data_with_vk_index(
                    output,
                    PRIVATE_KERNEL_INNER_VK_INDEX,
                ),
                private_call: inputs.private_calls[i],
            },
        );
    }

    output
}

struct BatchNTestBuilder<let N: u32> {
    tx_request: TxRequest,
    private_calls: [FixtureBuilder; N],
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
}

impl<let N: u32> BatchNTestBuilder<N> {
    fn new() -> Self {
        let mut private_calls = [FixtureBuilder::new(); N];

        private_calls[0] = FixtureBuilder::new_from_counter(2).is_first_call();
        let mut first_private_call = private_calls[0];
        first_private_call.compute_update_tree_and_hints();
        private_calls[0] = first_private_call;

        for i in 1..N {
            let mut private_call = FixtureBuilder::new_from_counter(i * 1000);
            private_call.anchor_block_header = private_calls[0].anchor_block_header;
            private_call.tx_context = private_calls[0].tx_context;
            private_call.compute_update_tree_and_hints();
            private_calls[i] = private_call;
        }

        let tx_request = private_calls[0].to_tx_request();

        BatchNTestBuilder {
            tx_request,
            private_calls,
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
        inputs.private_calls[0].public_inputs.private_call_requests.array[0].args_hash += 1;

        private_kernel_init_n::execute::<N>(inputs)
    }

    fn execute_depth_first_with_sibling(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(true, true)
    }

    fn execute_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        private_kernel_init_n::execute::<N>(self.inputs_with_shape(
            include_sibling,
            sync_second_to_third,
        ))
    }

    fn execute_sequential_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        execute_init_n_sequential(
            self.inputs_with_shape(include_sibling, sync_second_to_third),
        )
    }

    fn inputs_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelInitNCircuitPrivateInputs<N> {
        let mut private_calls = self.private_calls;

        if include_sibling {
            let mut first_private_call = private_calls[0];
            first_private_call.append_private_call_requests(2);
            private_calls[0] = first_private_call;
        } else {
            let mut first_private_call = private_calls[0];
            first_private_call.add_private_call_request();
            private_calls[0] = first_private_call;
        }

        for i in 1..N {
            let previous_request = private_calls[i - 1].private_call_requests.get(0);
            private_calls[i].msg_sender = private_calls[i - 1].contract_address;
            private_calls[i].counter_start = previous_request.start_side_effect_counter;
            if private_calls[i].counter <= previous_request.start_side_effect_counter {
                private_calls[i].counter = previous_request.start_side_effect_counter + 1;
            }

            if i < N - 1 {
                let mut private_call = private_calls[i];
                private_call.add_private_call_request();
                private_calls[i] = private_call;
            }
        }

        for i in 1..N {
            let reverse_index = N - i - 1;
            let next_call_request = private_calls[reverse_index + 1].to_private_call_request();
            let next_counter = private_calls[reverse_index + 1].counter;
            let mut current_call = private_calls[reverse_index];
            if (reverse_index < N - 2) | sync_second_to_third {
                current_call.private_call_requests.set(0, next_call_request);
            }
            if current_call.counter <= next_counter {
                current_call.counter = next_counter + 1;
            }
            private_calls[reverse_index] = current_call;
        }

        if include_sibling {
            let mut first_private_call = private_calls[0];
            let mut sibling_request = private_calls[0].private_call_requests.get(1);
            sibling_request.start_side_effect_counter = private_calls[1].counter + 1;
            sibling_request.end_side_effect_counter = sibling_request.start_side_effect_counter + 1;
            first_private_call.private_call_requests.set(1, sibling_request);
            private_calls[0] = first_private_call;
        }

        if include_sibling {
            let sibling_request = private_calls[0].private_call_requests.get(1);
            if private_calls[0].counter <= sibling_request.end_side_effect_counter {
                private_calls[0].counter = sibling_request.end_side_effect_counter + 1;
            }
        }

        let mut private_call_data = [private_calls[0].to_private_call_data(); N];
        for i in 1..N {
            private_call_data[i] = private_calls[i].to_private_call_data();
        }

        PrivateKernelInitNCircuitPrivateInputs {
            tx_request: self.tx_request,
            private_calls: private_call_data,
            vk_tree_root: private_calls[0].vk_tree_root,
            protocol_contracts: private_calls[0].protocol_contracts,
            is_private_only: self.is_private_only,
            first_nullifier_hint: self.first_nullifier_hint,
            revertible_counter_hint: self.revertible_counter_hint,
        }
    }

    fn append_note_hashes(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_note_hashes(amount);
        self.private_calls[index] = private_call;
    }

    fn append_nullifiers(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_nullifiers(amount);
        self.private_calls[index] = private_call;
    }

    fn append_l2_to_l1_msgs(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_l2_to_l1_msgs(amount);
        self.private_calls[index] = private_call;
    }

    fn append_private_logs(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_private_logs(amount);
        self.private_calls[index] = private_call;
    }

    fn append_contract_class_logs(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_contract_class_logs(amount);
        self.private_calls[index] = private_call;
    }

    fn append_public_call_requests(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_public_call_requests(amount);
        self.private_calls[index] = private_call;
    }

    fn append_note_hash_read_requests(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_note_hash_read_requests(amount);
        self.private_calls[index] = private_call;
    }

    fn append_nullifier_read_requests(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_nullifier_read_requests(amount);
        self.private_calls[index] = private_call;
    }

    fn append_key_validation_requests(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_key_validation_requests(amount);
        self.private_calls[index] = private_call;
    }

    fn set_fee_payer(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.is_fee_payer = true;
        self.private_calls[index] = private_call;
    }

    fn set_public_teardown_call_request(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.set_public_teardown_call_request();
        self.private_calls[index] = private_call;
    }

    fn end_setup(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.end_setup();
        self.private_calls[index] = private_call;
    }

    fn set_static_call(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        let _ = private_call.is_static_call();
        self.private_calls[index] = private_call;
    }

    fn increment_anchor_block_header_version(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.anchor_block_header.global_variables.version += 1;
        self.private_calls[index] = private_call;
    }
}

struct InnerNTestBuilder<let N: u32> {
    previous_kernel: FixtureBuilder,
    private_calls: [FixtureBuilder; N],
}

impl<let N: u32> InnerNTestBuilder<N> {
    fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new_from_counter(135)
            .in_vk_tree(PRIVATE_KERNEL_INIT_VK_INDEX)
            .as_parent_contract();
        previous_kernel.compute_update_tree_and_hints();

        let mut private_calls = [FixtureBuilder::new(); N];
        for i in 0..N {
            let mut private_call = FixtureBuilder::new_from_counter((i + 1) * 1000);
            private_call.anchor_block_header = previous_kernel.anchor_block_header;
            private_call.tx_context = previous_kernel.tx_context;
            private_call.compute_update_tree_and_hints();
            private_calls[i] = private_call;
        }

        InnerNTestBuilder { previous_kernel, private_calls }
    }

    fn execute_linear_chain(self) -> PrivateKernelCircuitPublicInputs {
        private_kernel_inner_n::execute::<N>(self.linear_chain_inputs())
    }

    fn execute_linear_chain_sequential(self) -> PrivateKernelCircuitPublicInputs {
        execute_inner_n_sequential(self.linear_chain_inputs())
    }

    fn linear_chain_inputs(self) -> PrivateKernelInnerNCircuitPrivateInputs<N> {
        let mut previous_kernel = self.previous_kernel;
        let mut private_calls = self.private_calls;

        for i in 0..N - 1 {
            let mut private_call = private_calls[i];
            private_call.add_private_call_request();
            private_calls[i] = private_call;
            let next_request = private_calls[i].private_call_requests.get(0);
            private_calls[i + 1].msg_sender = private_calls[i].contract_address;
            private_calls[i + 1].counter_start = next_request.start_side_effect_counter;
            if private_calls[i + 1].counter <= next_request.start_side_effect_counter {
                private_calls[i + 1].counter = next_request.start_side_effect_counter + 1;
            }
        }

        for i in 1..N {
            let reverse_index = N - i - 1;
            let next_call_request = private_calls[reverse_index + 1].to_private_call_request();
            let next_counter = private_calls[reverse_index + 1].counter;
            let mut current_call = private_calls[reverse_index];
            current_call.private_call_requests.set(0, next_call_request);
            if current_call.counter <= next_counter {
                current_call.counter = next_counter + 1;
            }
            private_calls[reverse_index] = current_call;
        }

        previous_kernel.private_call_requests.push(private_calls[0].to_private_call_request());

        let mut private_call_data = [private_calls[0].to_private_call_data(); N];
        for i in 1..N {
            private_call_data[i] = private_calls[i].to_private_call_data();
        }

        PrivateKernelInnerNCircuitPrivateInputs {
            previous_kernel: previous_kernel.to_private_kernel_data(),
            private_calls: private_call_data,
        }
    }

    fn append_note_hashes(&mut self, index: u32, amount: u32) {
        let mut private_call = self.private_calls[index];
        private_call.append_note_hashes(amount);
        self.private_calls[index] = private_call;
    }
}

fn add_one_of_each_per_call_with_tx_bounded_logs<let N: u32>(builder: &mut BatchNTestBuilder<N>) {
    for i in 0..N {
        builder.append_note_hashes(i, 1);
        builder.append_nullifiers(i, 1);
        builder.append_l2_to_l1_msgs(i, 1);
        builder.append_private_logs(i, 1);
        builder.append_public_call_requests(i, 1);
        builder.append_note_hash_read_requests(i, 1);
        builder.append_nullifier_read_requests(i, 1);
        builder.append_key_validation_requests(i, 1);
    }

    builder.append_contract_class_logs(0, 1);
}

fn assert_batch_n_linear_chain_consumes_all_calls<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let output = builder.execute_linear_chain();

    assert_eq(output.end.private_call_stack.length, 0);
}

fn assert_batch_n_linear_chain_matches_sequential_kernels<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_with_everything_non_empty_matches_sequential_kernels<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    add_one_of_each_per_call_with_tx_bounded_logs(&mut builder);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_accumulates_side_effects_across_slots<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    for i in 0..N {
        builder.append_note_hashes(i, 1);
        builder.append_l2_to_l1_msgs(i, 1);
    }

    let note_hashes = builder.private_calls.map(|call| call.note_hashes.storage()[0]);
    let l2_to_l1_msgs = builder.private_calls.map(|call| call.l2_to_l1_msgs.storage()[0]);
    let contract_addresses = builder.private_calls.map(|call| call.contract_address);

    let output = builder.execute_linear_chain();

    assert_eq(output.end.note_hashes.length, N, "incorrect note hash length");
    assert_eq(output.end.l2_to_l1_msgs.length, N, "incorrect l2 to l1 message length");
    for i in 0..N {
        assert_eq(output.end.note_hashes.array[i], note_hashes[i]);
        assert_eq(output.end.note_hashes.array[i].contract_address, contract_addresses[i]);
        assert_eq(output.end.l2_to_l1_msgs.array[i], l2_to_l1_msgs[i]);
    }
}

fn assert_batch_n_depth_first_child_keeps_sibling_on_stack<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let output = builder.execute_depth_first_with_sibling();

    assert_eq(output.end.private_call_stack.length, 1);
}

fn assert_batch_n_depth_first_with_sibling_matches_sequential_kernels<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let batched = builder.execute_depth_first_with_sibling();
    let sequential = builder.execute_sequential_with_shape(true, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_last_call_must_match_previous_call_stack_fails<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let _ = builder.execute_linear_chain_without_second_to_third_sync();
}

fn assert_batch_n_second_call_must_match_first_call_stack_fails<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();

    let _ = builder.execute_linear_chain_without_first_to_second_sync();
}

fn assert_batch_n_second_call_claimed_lengths_are_validated<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.append_note_hash_read_requests(1, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + 1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_last_call_side_effect_counters_are_validated<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    let last_index = N - 1;

    builder.append_note_hashes(last_index, 1);
    let mut inputs = builder.inputs_with_shape(false, true);
    let mut note_hash = inputs.private_calls[last_index].public_inputs.note_hashes.array[0];
    note_hash.counter = inputs.private_calls[last_index].public_inputs.start_side_effect_counter;
    inputs.private_calls[last_index].public_inputs.note_hashes.array[0] = note_hash;

    let _ = private_kernel_init_n::execute::<N>(inputs);
}

fn assert_batch_n_second_call_must_match_previous_kernel_header<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.increment_anchor_block_header_version(1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_fee_payer_conflict_fails<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.set_fee_payer(0);
    builder.set_fee_payer(1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_public_teardown_conflict_fails<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.set_public_teardown_call_request(0);
    builder.set_public_teardown_call_request(1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_min_revertible_side_effect_counter_conflict_fails<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.end_setup(0);
    builder.end_setup(1);
    builder.revertible_counter_hint = builder.private_calls[0].min_revertible_side_effect_counter;

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_static_call_requires_static_nested_private_call_fails<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    builder.set_static_call(1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_static_call_restrictions_apply_to_next_slot_fails<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    let last_index = N - 1;

    for i in 1..N {
        builder.set_static_call(i);
    }
    builder.append_note_hashes(last_index, 1);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_linear_chain_consumes_all_calls<let N: u32>() {
    let builder = InnerNTestBuilder::<N>::new();

    let output = builder.execute_linear_chain();

    assert_eq(output.end.private_call_stack.length, 0);
}

fn assert_inner_n_linear_chain_matches_sequential_kernels<let N: u32>() {
    let builder = InnerNTestBuilder::<N>::new();

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_accumulates_side_effects_after_previous_kernel<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    builder.previous_kernel.append_note_hashes(1);
    for i in 0..N {
        builder.append_note_hashes(i, 1);
    }

    let previous_note_hash = builder.previous_kernel.note_hashes.storage()[0];
    let note_hashes = builder.private_calls.map(|call| call.note_hashes.storage()[0]);

    let output = builder.execute_linear_chain();

    assert_eq(output.end.note_hashes.length, N + 1, "incorrect note hash length");
    assert_eq(output.end.note_hashes.array[0], previous_note_hash);
    for i in 0..N {
        assert_eq(output.end.note_hashes.array[i + 1], note_hashes[i]);
    }
}

fn assert_inner_n_with_previous_side_effects_matches_sequential_kernels<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    builder.previous_kernel.append_note_hashes(1);
    for i in 0..N {
        builder.append_note_hashes(i, 1);
    }

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

#[test]
fn batch_2_accumulates_side_effects_across_slots() {
    assert_batch_n_accumulates_side_effects_across_slots::<2>();
}

#[test]
fn batch_2_linear_chain_consumes_all_calls() {
    assert_batch_n_linear_chain_consumes_all_calls::<2>();
}

#[test]
fn batch_2_linear_chain_matches_sequential_kernels() {
    assert_batch_n_linear_chain_matches_sequential_kernels::<2>();
}

#[test]
fn batch_2_depth_first_child_keeps_sibling_on_stack() {
    assert_batch_n_depth_first_child_keeps_sibling_on_stack::<2>();
}

#[test]
fn batch_2_depth_first_with_sibling_matches_sequential_kernels() {
    assert_batch_n_depth_first_with_sibling_matches_sequential_kernels::<2>();
}

#[test]
fn batch_2_with_everything_non_empty_matches_sequential_kernels() {
    assert_batch_n_with_everything_non_empty_matches_sequential_kernels::<2>();
}

#[test(should_fail_with = "args_hash does not match call request")]
fn batch_2_second_call_must_match_first_call_stack_fails() {
    assert_batch_n_second_call_must_match_first_call_stack_fails::<2>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn batch_2_second_call_claimed_lengths_are_validated() {
    assert_batch_n_second_call_claimed_lengths_are_validated::<2>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn batch_2_second_call_side_effect_counters_are_validated() {
    assert_batch_n_last_call_side_effect_counters_are_validated::<2>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn batch_2_second_call_must_match_previous_kernel_header() {
    assert_batch_n_second_call_must_match_previous_kernel_header::<2>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_2_fee_payer_conflict_fails() {
    assert_batch_n_fee_payer_conflict_fails::<2>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn batch_2_public_teardown_conflict_fails() {
    assert_batch_n_public_teardown_conflict_fails::<2>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn batch_2_min_revertible_side_effect_counter_conflict_fails() {
    assert_batch_n_min_revertible_side_effect_counter_conflict_fails::<2>();
}

// batch_2_static_call_requires_static_nested_private_call_fails: omitted.
// The N>=3 version sets call[1] as static and relies on the harness inserting a
// nested private_call_request from call[1] to call[2] -- that child is non-static,
// so the "nested private call of a static call must be static" assertion fires.
// At N=2 call[1] is the last call and the harness's intermediate-child loop
// (`for i in 1..N-1`) is empty, so call[1] has no children and the rule has
// nothing to check.

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn batch_2_static_call_restrictions_apply_to_next_slot_fails() {
    assert_batch_n_static_call_restrictions_apply_to_next_slot_fails::<2>();
}

#[test]
fn batch_3_accumulates_side_effects_across_slots() {
    assert_batch_n_accumulates_side_effects_across_slots::<3>();
}

#[test]
fn batch_3_linear_chain_consumes_all_calls() {
    assert_batch_n_linear_chain_consumes_all_calls::<3>();
}

#[test]
fn batch_3_linear_chain_matches_sequential_kernels() {
    assert_batch_n_linear_chain_matches_sequential_kernels::<3>();
}

#[test]
fn batch_3_depth_first_child_keeps_sibling_on_stack() {
    assert_batch_n_depth_first_child_keeps_sibling_on_stack::<3>();
}

#[test]
fn batch_3_depth_first_with_sibling_matches_sequential_kernels() {
    assert_batch_n_depth_first_with_sibling_matches_sequential_kernels::<3>();
}

#[test]
fn batch_3_with_everything_non_empty_matches_sequential_kernels() {
    assert_batch_n_with_everything_non_empty_matches_sequential_kernels::<3>();
}

#[test(should_fail_with = "call_context does not match call request")]
fn batch_3_third_call_must_match_second_call_stack_fails() {
    assert_batch_n_last_call_must_match_previous_call_stack_fails::<3>();
}

#[test(should_fail_with = "args_hash does not match call request")]
fn batch_3_second_call_must_match_first_call_stack_fails() {
    assert_batch_n_second_call_must_match_first_call_stack_fails::<3>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn batch_3_second_call_claimed_lengths_are_validated() {
    assert_batch_n_second_call_claimed_lengths_are_validated::<3>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn batch_3_third_call_side_effect_counters_are_validated() {
    assert_batch_n_last_call_side_effect_counters_are_validated::<3>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn batch_3_second_call_must_match_previous_kernel_header() {
    assert_batch_n_second_call_must_match_previous_kernel_header::<3>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_3_fee_payer_conflict_fails() {
    assert_batch_n_fee_payer_conflict_fails::<3>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn batch_3_public_teardown_conflict_fails() {
    assert_batch_n_public_teardown_conflict_fails::<3>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn batch_3_min_revertible_side_effect_counter_conflict_fails() {
    assert_batch_n_min_revertible_side_effect_counter_conflict_fails::<3>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn batch_3_static_call_requires_static_nested_private_call_fails() {
    assert_batch_n_static_call_requires_static_nested_private_call_fails::<3>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn batch_3_static_call_restrictions_apply_to_next_slot_fails() {
    assert_batch_n_static_call_restrictions_apply_to_next_slot_fails::<3>();
}

#[test]
fn inner_2_accumulates_side_effects_after_previous_kernel() {
    assert_inner_n_accumulates_side_effects_after_previous_kernel::<2>();
}

#[test]
fn inner_2_with_previous_side_effects_matches_sequential_kernels() {
    assert_inner_n_with_previous_side_effects_matches_sequential_kernels::<2>();
}

#[test]
fn inner_2_linear_chain_consumes_all_calls() {
    assert_inner_n_linear_chain_consumes_all_calls::<2>();
}

#[test]
fn inner_2_linear_chain_matches_sequential_kernels() {
    assert_inner_n_linear_chain_matches_sequential_kernels::<2>();
}

#[test]
fn inner_3_accumulates_side_effects_after_previous_kernel() {
    assert_inner_n_accumulates_side_effects_after_previous_kernel::<3>();
}

#[test]
fn inner_3_with_previous_side_effects_matches_sequential_kernels() {
    assert_inner_n_with_previous_side_effects_matches_sequential_kernels::<3>();
}

#[test]
fn inner_3_linear_chain_consumes_all_calls() {
    assert_inner_n_linear_chain_consumes_all_calls::<3>();
}

#[test]
fn inner_3_linear_chain_matches_sequential_kernels() {
    assert_inner_n_linear_chain_matches_sequential_kernels::<3>();
}
