use crate::{
    components::{
        private_call_data_validator::PrivateCallDataValidator,
        private_kernel_batch_validator::{
            PrivateCallStackBatchHints, PrivateKernelBatchValidator, simulate_pop_sequence,
        },
        private_kernel_circuit_output_composer::{compose_init_batch_n, compose_inner_batch_n},
    },
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

// Tests for the batched private kernels (`private_kernel_init_n` / `private_kernel_inner_n`, which
// validate N private calls in one shot via `PrivateKernelBatchValidator`).
//
// Two kinds of test:
//
//  - Differential (positive): the batched output must equal the result of running the same calls
//    through the legacy one-call-at-a-time kernels (`execute_{init,inner}_n_sequential`). Covered
//    across call-tree shapes (linear chain, depth-first with a sibling left on the stack, every
//    side-effect array populated) and tx-level configuration (is_private_only, protocol-nullifier
//    injection, expiration minimum, and fee-payer / public-teardown / min-revertible set by a
//    non-first call in the batch).
//
//  - Negative: the batched validator must reject malformed traces. The crafted-hint / tampered-
//    output drivers below feed arbitrary `popped_from_source` hints (or a mutated output) to
//    `validate_as_{init,inner}`, exercising: over-consuming a source, popping from the (empty) init
//    previous stack, dropping or corrupting an output-stack entry, forward/self source references
//    (`hint_i <= i`), and non-increasing side-effect-counter ordering.
//

/// Wraps composed `public_inputs` as a `PrivateKernelData` carrying the verification key for
/// `vk_index`, so one kernel's output can be fed back as the `previous_kernel` of the next.
fn private_kernel_data_with_vk_index(
    public_inputs: PrivateKernelCircuitPublicInputs,
    vk_index: u32,
) -> PrivateKernelData {
    let kernel_data = FixtureBuilder::new().in_vk_tree(vk_index).to_private_kernel_data();
    PrivateKernelData { public_inputs, vk_data: kernel_data.vk_data }
}

/// Asserts two kernel public inputs are equal field by field. Used by the differential tests to
/// compare the batched output against the sequential reference.
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

/// Sequential reference for the batched init: runs `private_calls[0]` through the legacy init
/// kernel and the rest through the legacy inner kernel, one call per kernel. The batched
/// `private_kernel_init_n` output must match this.
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

/// Sequential reference for the batched inner: runs each of the N calls through the legacy inner
/// kernel, one per kernel. The batched `private_kernel_inner_n` output must match this.
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

/// Builds a batched-init scenario of N private calls that share tx-level constants. `private_calls[0]`
/// is the first (tx-request) call; the rest are seeded so they can be wired into a call tree by
/// `inputs_with_shape`. Holds the tx-level hints passed to the init kernel.
struct BatchNTestBuilder<let N: u32> {
    tx_request: TxRequest,
    private_calls: [FixtureBuilder; N],
    is_private_only: bool,
    revertible_counter_hint: u32,
}

impl<let N: u32> BatchNTestBuilder<N> {
    /// N calls with shared anchor/tx-context; call 0 is the first call, calls 1.. start at disjoint
    /// counter ranges so they can later be linked into a tree.
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
            revertible_counter_hint: 0,
        }
    }

    /// Runs the batched init kernel on a linear-chain tree (A->B->C...): every call has exactly one
    /// child, the next call in the array.
    fn execute_linear_chain(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(false, true)
    }

    /// Linear chain but the second call's request is left un-synced to the third call, so the third
    /// call no longer matches the request it is popped against (negative test).
    fn execute_linear_chain_without_second_to_third_sync(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(false, false)
    }

    /// Linear chain but call 0's request to call 1 has a corrupted args_hash, so call 1 no longer
    /// matches its request (negative test).
    fn execute_linear_chain_without_first_to_second_sync(self) -> PrivateKernelCircuitPublicInputs {
        let mut inputs = self.inputs_with_shape(false, true);
        inputs.private_calls[0].public_inputs.private_call_requests.array[0].args_hash += 1;

        private_kernel_init_n::execute::<N>(inputs)
    }

    /// Runs the batched init kernel on a tree where call 0 has two children; the batch consumes the
    /// first child's subtree and leaves the sibling on the output stack.
    fn execute_depth_first_with_sibling(self) -> PrivateKernelCircuitPublicInputs {
        self.execute_with_shape(true, true)
    }

    /// Runs the batched init kernel on the tree described by `inputs_with_shape`.
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

    /// Sequential reference for the same shape: the differential tests compare this against
    /// `execute_with_shape`.
    fn execute_sequential_with_shape(
        self,
        include_sibling: bool,
        sync_second_to_third: bool,
    ) -> PrivateKernelCircuitPublicInputs {
        execute_init_n_sequential(
            self.inputs_with_shape(include_sibling, sync_second_to_third),
        )
    }

    /// Wires `private_calls` into a call tree and returns the init-kernel inputs. `include_sibling`
    /// gives call 0 a second child (left on the stack); `sync_second_to_third` controls whether the
    /// chain past the second call is linked (set false to build a mismatching-request negative case).
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
            revertible_counter_hint: self.revertible_counter_hint,
        }
    }

    // Per-call mutators: each forwards to the underlying `FixtureBuilder` for `private_calls[index]`,
    // so a test can populate side effects / set flags on a specific call in the batch.

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

    fn increment_tx_request_salt(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.tx_request_salt += 1;
        self.private_calls[index] = private_call;
    }

    fn increment_tx_context_chain_id(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.tx_context.chain_id += 1;
        self.private_calls[index] = private_call;
    }
}

/// Builds a batched-inner scenario: a previous kernel plus N private calls sharing its tx constants.
/// `linear_chain_inputs` links them into a chain rooted at the previous kernel's call stack.
struct InnerNTestBuilder<let N: u32> {
    previous_kernel: FixtureBuilder,
    private_calls: [FixtureBuilder; N],
}

impl<let N: u32> InnerNTestBuilder<N> {
    /// A previous kernel (init vk) plus N calls with shared anchor/tx-context at disjoint counters.
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

    /// Runs the batched inner kernel on a linear chain whose root sits on the previous kernel's stack.
    fn execute_linear_chain(self) -> PrivateKernelCircuitPublicInputs {
        private_kernel_inner_n::execute::<N>(self.linear_chain_inputs())
    }

    /// Sequential reference for the same chain (for the differential tests).
    fn execute_linear_chain_sequential(self) -> PrivateKernelCircuitPublicInputs {
        execute_inner_n_sequential(self.linear_chain_inputs())
    }

    /// Links the N calls into a chain (each call is the next call's parent), pushes the root onto the
    /// previous kernel's call stack, and returns the inner-kernel inputs.
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

    /// Runs the batched inner kernel on a depth-first tree: the root (pushed onto the previous
    /// kernel's stack) has two children -- one starts the chain consumed by the batch, the other is
    /// a sibling left on the output stack.
    fn execute_depth_first_with_sibling(self) -> PrivateKernelCircuitPublicInputs {
        private_kernel_inner_n::execute::<N>(self.depth_first_inputs())
    }

    /// Sequential reference for the depth-first tree (for the differential tests).
    fn execute_depth_first_with_sibling_sequential(self) -> PrivateKernelCircuitPublicInputs {
        execute_inner_n_sequential(self.depth_first_inputs())
    }

    /// Mirrors `linear_chain_inputs`, but gives the root a second child (a sibling) that no batched
    /// call consumes, so it is left on the output stack. Requires N >= 2.
    fn depth_first_inputs(self) -> PrivateKernelInnerNCircuitPrivateInputs<N> {
        let mut previous_kernel = self.previous_kernel;
        let mut private_calls = self.private_calls;

        let mut root = private_calls[0];
        root.append_private_call_requests(2);
        private_calls[0] = root;

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
            current_call.private_call_requests.set(0, next_call_request);
            if current_call.counter <= next_counter {
                current_call.counter = next_counter + 1;
            }
            private_calls[reverse_index] = current_call;
        }

        let mut root = private_calls[0];
        let mut sibling_request = private_calls[0].private_call_requests.get(1);
        sibling_request.start_side_effect_counter = private_calls[1].counter + 1;
        sibling_request.end_side_effect_counter = sibling_request.start_side_effect_counter + 1;
        root.private_call_requests.set(1, sibling_request);
        private_calls[0] = root;
        if private_calls[0].counter <= sibling_request.end_side_effect_counter {
            private_calls[0].counter = sibling_request.end_side_effect_counter + 1;
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

    /// Appends `amount` note hashes to `private_calls[index]`.
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

    fn increment_tx_request_salt(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.tx_request_salt += 1;
        self.private_calls[index] = private_call;
    }

    fn increment_anchor_block_header_version(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.anchor_block_header.global_variables.version += 1;
        self.private_calls[index] = private_call;
    }

    fn increment_tx_context_chain_id(&mut self, index: u32) {
        let mut private_call = self.private_calls[index];
        private_call.tx_context.chain_id += 1;
        self.private_calls[index] = private_call;
    }
}

/// Populates every call with one of each per-call side-effect type (plus one tx-bounded contract
/// class log on call 0), so the differential test exercises the concatenation + scoping of all
/// accumulator arrays at once.
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

/// Inner analogue of `add_one_of_each_per_call_with_tx_bounded_logs`: one of each per-call
/// side-effect type on every call, plus one tx-bounded contract class log on call 0.
fn add_one_of_each_per_inner_call<let N: u32>(builder: &mut InnerNTestBuilder<N>) {
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

/// Linear chain: every call is consumed, so the output stack is empty.
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

fn assert_init_n_salt_mismatch_rejected<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    // The init kernel binds every call's `tx_request_salt` to the tx request's salt. The first call
    // is bound directly (`validate_against_tx_request`); subsequent calls are bound via the shared
    // constants (`validate_against_constants`). Mutate a subsequent call when one exists (N > 1),
    // otherwise the only (first) call.
    let index = if N == 1 { 0 } else { 1 };
    builder.increment_tx_request_salt(index);

    let _ = builder.execute_linear_chain();
}

fn assert_init_n_tx_context_mismatch_rejected<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();

    // The first call's `tx_context` is bound to the tx request (`validate_against_tx_request`);
    // subsequent calls are bound to the shared constants (`validate_against_constants`). Mutate a
    // subsequent call when one exists (N > 1), otherwise the only (first) call.
    let index = if N == 1 { 0 } else { 1 };
    builder.increment_tx_context_chain_id(index);

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

fn assert_inner_n_salt_mismatch_rejected<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Every inner call's `tx_request_salt` must match the salt propagated by the previous kernel's
    // constants (`validate_against_constants`).
    builder.increment_tx_request_salt(0);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_anchor_mismatch_rejected<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Every inner call's `anchor_block_header` must match the previous kernel's constants.
    builder.increment_anchor_block_header_version(0);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_tx_context_mismatch_rejected<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Every inner call's `tx_context` must match the previous kernel's constants.
    builder.increment_tx_context_chain_id(0);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_with_everything_non_empty_matches_sequential_kernels<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    add_one_of_each_per_inner_call(&mut builder);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_is_private_only_matches_sequential<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    // `is_private_only` is propagated from the previous kernel; the batched and sequential paths
    // must propagate it identically.
    builder.previous_kernel.is_private_only = true;

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_expiration_timestamp_min_matches_sequential<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    // Give each call a distinct (decreasing) expiration; the output must carry the minimum across
    // the previous kernel and all calls, identically on both paths.
    for i in 0..N {
        let mut call = builder.private_calls[i];
        call.expiration_timestamp -= (i as u64) + 1;
        builder.private_calls[i] = call;
    }

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_fee_payer_midbatch_matches_sequential<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    // A non-first call nominates itself as fee payer.
    builder.set_fee_payer(N - 1);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_public_teardown_midbatch_matches_sequential<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    builder.set_public_teardown_call_request(N - 1);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_min_revertible_midbatch_matches_sequential<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    // A non-first call ends the setup phase, setting min_revertible_side_effect_counter. The
    // previous kernel must already claim that counter (inner propagates it from the previous kernel
    // rather than from an input hint, as the init kernel does).
    builder.end_setup(N - 1);
    builder.previous_kernel.claimed_revertible_counter =
        builder.private_calls[N - 1].min_revertible_side_effect_counter;

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_linear_chain_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_depth_first_child_keeps_sibling_on_stack<let N: u32>() {
    let builder = InnerNTestBuilder::<N>::new();

    let output = builder.execute_depth_first_with_sibling();

    assert_eq(output.end.private_call_stack.length, 1);
}

fn assert_inner_n_depth_first_with_sibling_matches_sequential_kernels<let N: u32>() {
    let builder = InnerNTestBuilder::<N>::new();

    let batched = builder.execute_depth_first_with_sibling();
    let sequential = builder.execute_depth_first_with_sibling_sequential();

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_inner_n_claimed_lengths_are_validated<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Every inner call's claimed array lengths are bounds-checked by `validate_common`.
    builder.append_note_hash_read_requests(0, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + 1);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_side_effect_counters_are_validated<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    builder.append_note_hashes(0, 1);
    let mut inputs = builder.linear_chain_inputs();
    // Push a side-effect counter below the call's start counter; `validate_common` must reject it.
    let mut note_hash = inputs.private_calls[0].public_inputs.note_hashes.array[0];
    note_hash.counter = inputs.private_calls[0].public_inputs.start_side_effect_counter;
    inputs.private_calls[0].public_inputs.note_hashes.array[0] = note_hash;

    let _ = private_kernel_inner_n::execute::<N>(inputs);
}

fn assert_inner_n_fee_payer_conflict_fails<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Two calls in the batch both nominate themselves as fee payer; the composer must reject the
    // second nomination.
    builder.set_fee_payer(0);
    builder.set_fee_payer(1);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_public_teardown_conflict_fails<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    builder.set_public_teardown_call_request(0);
    builder.set_public_teardown_call_request(1);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_min_revertible_conflict_fails<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // Two calls both end setup, so each tries to set min_revertible_side_effect_counter; the second
    // must be rejected. The previous kernel claims the first call's counter (inner propagates the
    // claimed counter from the previous kernel).
    builder.end_setup(0);
    builder.end_setup(1);
    builder.previous_kernel.claimed_revertible_counter =
        builder.private_calls[0].min_revertible_side_effect_counter;

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_static_call_requires_static_nested_private_call_fails<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();

    // A static call's nested private call must also be static. Call 1 is made static but its child
    // (call 2 in the chain) is not, so the rule fires. Requires call 1 to have a child (N >= 3).
    builder.set_static_call(1);

    let _ = builder.execute_linear_chain();
}

fn assert_inner_n_static_call_restrictions_apply_to_next_slot_fails<let N: u32>() {
    let mut builder = InnerNTestBuilder::<N>::new();
    let last_index = N - 1;

    // Make the non-root calls static, then emit a note hash from the last (static) call; static
    // calls may not emit side effects.
    for i in 1..N {
        builder.set_static_call(i);
    }
    builder.append_note_hashes(last_index, 1);

    let _ = builder.execute_linear_chain();
}

fn assert_batch_n_is_private_only_matches_sequential<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    builder.is_private_only = true;

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_fee_payer_midbatch_matches_sequential<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    // A non-first call nominates itself as fee payer.
    builder.set_fee_payer(N - 1);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_public_teardown_midbatch_matches_sequential<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    builder.set_public_teardown_call_request(N - 1);

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_min_revertible_midbatch_matches_sequential<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    // A non-first call ends the setup phase, setting min_revertible_side_effect_counter.
    builder.end_setup(N - 1);
    builder.revertible_counter_hint =
        builder.private_calls[N - 1].min_revertible_side_effect_counter;

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_protocol_nullifier_matches_sequential<let N: u32>() {
    let builder = BatchNTestBuilder::<N>::new();
    // The kernel always injects the protocol nullifier. Both the batched and the sequential paths
    // must inject the same prepended nullifier.
    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

fn assert_batch_n_expiration_timestamp_min_matches_sequential<let N: u32>() {
    let mut builder = BatchNTestBuilder::<N>::new();
    // Give each call a distinct (decreasing) expiration; the output must carry the minimum.
    for i in 0..N {
        let mut call = builder.private_calls[i];
        call.expiration_timestamp -= (i as u64) + 1;
        builder.private_calls[i] = call;
    }

    let batched = builder.execute_linear_chain();
    let sequential = builder.execute_sequential_with_shape(false, true);

    assert_private_kernel_public_inputs_eq(batched, sequential);
}

/// Builds a batched-inner scenario in which a prover processes the calls in an order different from the one
/// determined by the side effect counters
///
/// The previous kernel's call stack is `[C, B]` (B on top), where `B` and `C` are siblings (children
/// of some app processed in an earlier kernel) and `B` additionally has a single child `D`. Given this data,
/// the order in which the calls should be processed is `[B, D, C]`. The prover instead supplies the calls in the order
/// `[B, C, D]` with `popped_from_source = [0, 0, 1]`: pop `B` and `C` from the previous stack
/// (source 0), then pop `D` from `B`'s own `private_call_requests` (source 1). We test that this order is rejected by enforcing increasing side effect counters.
fn non_side_effect_ordered_inner_scenario() -> (PrivateKernelInnerNCircuitPrivateInputs<3>, PrivateCallStackBatchHints<3>) {
    // B: interval [10, 15]; has child D.
    let mut b = FixtureBuilder::new_from_counter(10);
    b.counter = 15;
    b.args_hash = 11111;

    // D: child of B; interval [11, 12].
    let mut d = FixtureBuilder::new_from_counter(11);
    d.counter = 12;
    d.args_hash = 22222;
    d.msg_sender = b.contract_address;

    // C: sibling of B; interval [20, 21]; no children.
    let mut c = FixtureBuilder::new_from_counter(20);
    c.counter = 21;
    c.args_hash = 33333;

    // B's only nested call is D (source 1 when B is private_calls[0]).
    b.private_call_requests.push(d.to_private_call_request());

    // Previous kernel stack: [C, B] with B on top (highest index).
    let mut previous_kernel =
        FixtureBuilder::new_from_counter(5).in_vk_tree(PRIVATE_KERNEL_INIT_VK_INDEX);
    previous_kernel.private_call_requests.push(c.to_private_call_request());
    previous_kernel.private_call_requests.push(b.to_private_call_request());

    let inputs = PrivateKernelInnerNCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(),
        private_calls: [
            b.to_private_call_data(),
            c.to_private_call_data(),
            d.to_private_call_data(),
        ],
    };

    (inputs, PrivateCallStackBatchHints { popped_from_source: [0, 0, 1] })
}

// Utility functions to compose, validate and execute init and inner kernels

fn compose_inner<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    // Safety: test witness generator; `validate_inner` re-checks the output against the hints.
    unsafe {
        compose_inner_batch_n(inputs.previous_kernel.public_inputs, inputs.private_calls)
    }
}

fn validate_inner<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
    output: PrivateKernelCircuitPublicInputs,
    hints: PrivateCallStackBatchHints<N>,
) {
    let popped = PrivateKernelBatchValidator::new(output, inputs.private_calls, hints)
        .validate_as_inner(inputs.previous_kernel.public_inputs);
    for i in 0..N {
        PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_request(popped[i]);
    }
}

fn drive_inner_with_hints<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
    hints: PrivateCallStackBatchHints<N>,
) {
    validate_inner(inputs, compose_inner(inputs), hints);
}

fn compose_init<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    // Safety: test witness generator; `validate_init` re-checks the output against the hints.
    unsafe {
        compose_init_batch_n(
            inputs.tx_request,
            inputs.vk_tree_root,
            inputs.protocol_contracts,
            inputs.is_private_only,
            inputs.revertible_counter_hint,
            inputs.private_calls,
        )
    }
}

fn validate_init<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
    output: PrivateKernelCircuitPublicInputs,
    hints: PrivateCallStackBatchHints<N>,
) {
    let popped = PrivateKernelBatchValidator::new(output, inputs.private_calls, hints)
        .validate_as_init(
            inputs.tx_request,
            inputs.vk_tree_root,
            inputs.protocol_contracts,
            inputs.is_private_only,
            inputs.revertible_counter_hint,
        );
    for i in 1..N {
        PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_request(popped[i]);
    }
}

fn drive_init_with_hints<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
    hints: PrivateCallStackBatchHints<N>,
) {
    validate_init(inputs, compose_init(inputs), hints);
}

// Linear chain A->B->C as init inputs: A has one child B, B has one child C. Honest hints [0,1,2].
fn init_linear_chain_inputs() -> PrivateKernelInitNCircuitPrivateInputs<3> {
    BatchNTestBuilder::<3>::new().inputs_with_shape(false, true)
}

// Linear chain over the previous kernel stack as inner inputs: previous stack is [call0] (length 1),
// call0 has child call1, call1 has child call2. Honest hints [0,1,2].
fn inner_linear_chain_inputs() -> PrivateKernelInnerNCircuitPrivateInputs<3> {
    InnerNTestBuilder::<3>::new().linear_chain_inputs()
}

// Previous kernel stack is [X, Y] with Y on top. The batch pops Y (and its child Z), leaving X on
// the bottom of the stack. Honest hints [0, 1]: Y from the previous stack, Z from Y.
fn inner_prev_remainder_scenario() -> (PrivateKernelInnerNCircuitPrivateInputs<2>, PrivateCallStackBatchHints<2>) {
    let mut previous_kernel = FixtureBuilder::new_from_counter(135)
        .in_vk_tree(PRIVATE_KERNEL_INIT_VK_INDEX)
        .as_parent_contract();
    previous_kernel.compute_update_tree_and_hints();

    let mut y = FixtureBuilder::new_from_counter(1000);
    y.counter = 1500;
    y.anchor_block_header = previous_kernel.anchor_block_header;
    y.tx_context = previous_kernel.tx_context;
    y.compute_update_tree_and_hints();

    let mut z = FixtureBuilder::new_from_counter(1100);
    z.counter = 1200;
    z.msg_sender = y.contract_address;
    z.anchor_block_header = previous_kernel.anchor_block_header;
    z.tx_context = previous_kernel.tx_context;
    z.compute_update_tree_and_hints();

    // Y's only child is Z.
    y.private_call_requests.push(z.to_private_call_request());

    // X stays on the stack; give it an earlier range than Y.
    let mut x = FixtureBuilder::new_from_counter(500);
    x.counter = 600;
    x.anchor_block_header = previous_kernel.anchor_block_header;
    x.tx_context = previous_kernel.tx_context;

    // Stack order [X, Y] with Y on top (pushed last).
    previous_kernel.private_call_requests.push(x.to_private_call_request());
    previous_kernel.private_call_requests.push(y.to_private_call_request());

    let inputs = PrivateKernelInnerNCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(),
        private_calls: [y.to_private_call_data(), z.to_private_call_data()],
    };

    (inputs, PrivateCallStackBatchHints { popped_from_source: [0, 1] })
}

/// Builds an init batch `[A, B, C]` where A has children B and C (declared B-first) and B has a
/// child D that is NOT included in the batch. The canonical pop-top order is A, B, D, C; this
/// scenario instead defers D (`popped_from_source = [0, 1, 1]`: B and C both popped from A), so the
/// batch processes A, B, C and leaves D on the output stack for a later kernel. Returns the init
/// inputs, the deferral hints, and the D fixture (the deferred call).
fn deferred_grandchild_init_scenario() -> (PrivateKernelInitNCircuitPrivateInputs<3>, PrivateCallStackBatchHints<3>, FixtureBuilder) {
    let mut a = FixtureBuilder::new_from_counter(2).is_first_call();
    a.counter = 100;
    a.compute_update_tree_and_hints();

    let mut b = FixtureBuilder::new_from_counter(10);
    b.counter = 30;
    b.msg_sender = a.contract_address;
    b.anchor_block_header = a.anchor_block_header;
    b.tx_context = a.tx_context;
    b.args_hash = 11111;
    b.compute_update_tree_and_hints();

    // D: child of B, range nested in B's, but processed only in a later kernel.
    let mut d = FixtureBuilder::new_from_counter(15);
    d.counter = 20;
    d.msg_sender = b.contract_address;
    d.anchor_block_header = a.anchor_block_header;
    d.tx_context = a.tx_context;
    d.args_hash = 22222;
    d.compute_update_tree_and_hints();

    // C: A's second child, with a counter range that comes AFTER B's whole subtree.
    let mut c = FixtureBuilder::new_from_counter(40);
    c.counter = 50;
    c.msg_sender = a.contract_address;
    c.anchor_block_header = a.anchor_block_header;
    c.tx_context = a.tx_context;
    c.args_hash = 33333;
    c.compute_update_tree_and_hints();

    b.private_call_requests.push(d.to_private_call_request());
    a.private_call_requests.push(b.to_private_call_request());
    a.private_call_requests.push(c.to_private_call_request());

    let inputs = PrivateKernelInitNCircuitPrivateInputs {
        tx_request: a.to_tx_request(),
        private_calls: [
            a.to_private_call_data(),
            b.to_private_call_data(),
            c.to_private_call_data(),
        ],
        vk_tree_root: a.vk_tree_root,
        protocol_contracts: a.protocol_contracts,
        is_private_only: false,
        revertible_counter_hint: 0,
    };

    (inputs, PrivateCallStackBatchHints { popped_from_source: [0, 1, 1] }, d)
}

// N = 1 is the degenerate batch: a single private call. The multi-call scenarios (depth-first
// sibling handling, second-call stack/constants mismatches, mid-batch fee-payer/teardown/min-
// revertible nominations, static-nested-call rules) have no analogue here, so only the single-call
// baseline and the per-call constants checks apply. `linear_chain_consumes_all_calls` is also
// omitted for the init batch: the single call's child request is legitimately left on the stack as
// a deferred call, so the stack is not empty (the inner batch consumes its root from the previous
// kernel's stack, so its counterpart is kept).
#[test]
fn batch_1_linear_chain_matches_sequential_kernels() {
    assert_batch_n_linear_chain_matches_sequential_kernels::<1>();
}

#[test]
fn batch_1_with_everything_non_empty_matches_sequential_kernels() {
    assert_batch_n_with_everything_non_empty_matches_sequential_kernels::<1>();
}

#[test]
fn batch_1_is_private_only_matches_sequential() {
    assert_batch_n_is_private_only_matches_sequential::<1>();
}

#[test]
fn batch_1_protocol_nullifier_matches_sequential() {
    assert_batch_n_protocol_nullifier_matches_sequential::<1>();
}

#[test]
fn batch_1_expiration_timestamp_min_matches_sequential() {
    assert_batch_n_expiration_timestamp_min_matches_sequential::<1>();
}

// For N = 1 the single call is the first call, so its salt is bound directly by
// `validate_against_tx_request` (hence the different failure message than the N > 1 cases).
#[test(should_fail_with = "tx_request_salt in private call does not match the salt in tx_request")]
fn batch_1_salt_mismatch_rejected() {
    assert_init_n_salt_mismatch_rejected::<1>();
}

#[test(should_fail_with = "tx_context in private call does not match the value in tx_request")]
fn batch_1_tx_context_mismatch_rejected() {
    assert_init_n_tx_context_mismatch_rejected::<1>();
}

#[test]
fn inner_1_accumulates_side_effects_after_previous_kernel() {
    assert_inner_n_accumulates_side_effects_after_previous_kernel::<1>();
}

#[test]
fn inner_1_with_previous_side_effects_matches_sequential_kernels() {
    assert_inner_n_with_previous_side_effects_matches_sequential_kernels::<1>();
}

#[test]
fn inner_1_linear_chain_consumes_all_calls() {
    assert_inner_n_linear_chain_consumes_all_calls::<1>();
}

#[test]
fn inner_1_linear_chain_matches_sequential_kernels() {
    assert_inner_n_linear_chain_matches_sequential_kernels::<1>();
}

#[test]
fn inner_1_with_everything_non_empty_matches_sequential_kernels() {
    assert_inner_n_with_everything_non_empty_matches_sequential_kernels::<1>();
}

#[test]
fn inner_1_is_private_only_matches_sequential() {
    assert_inner_n_is_private_only_matches_sequential::<1>();
}

#[test]
fn inner_1_expiration_timestamp_min_matches_sequential() {
    assert_inner_n_expiration_timestamp_min_matches_sequential::<1>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn inner_1_salt_mismatch_rejected() {
    assert_inner_n_salt_mismatch_rejected::<1>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn inner_1_anchor_mismatch_rejected() {
    assert_inner_n_anchor_mismatch_rejected::<1>();
}

#[test(should_fail_with = "mismatch tx context")]
fn inner_1_tx_context_mismatch_rejected() {
    assert_inner_n_tx_context_mismatch_rejected::<1>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn inner_1_claimed_lengths_are_validated() {
    assert_inner_n_claimed_lengths_are_validated::<1>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn inner_1_side_effect_counters_are_validated() {
    assert_inner_n_side_effect_counters_are_validated::<1>();
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

#[test(should_fail_with = "mismatch tx_request_salt")]
fn batch_2_salt_mismatch_rejected() {
    assert_init_n_salt_mismatch_rejected::<2>();
}

#[test(should_fail_with = "mismatch tx context")]
fn batch_2_tx_context_mismatch_rejected() {
    assert_init_n_tx_context_mismatch_rejected::<2>();
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
fn batch_2_is_private_only_matches_sequential() {
    assert_batch_n_is_private_only_matches_sequential::<2>();
}

#[test]
fn batch_2_fee_payer_midbatch_matches_sequential() {
    assert_batch_n_fee_payer_midbatch_matches_sequential::<2>();
}

#[test]
fn batch_2_public_teardown_midbatch_matches_sequential() {
    assert_batch_n_public_teardown_midbatch_matches_sequential::<2>();
}

#[test]
fn batch_2_min_revertible_midbatch_matches_sequential() {
    assert_batch_n_min_revertible_midbatch_matches_sequential::<2>();
}

#[test]
fn batch_2_protocol_nullifier_matches_sequential() {
    assert_batch_n_protocol_nullifier_matches_sequential::<2>();
}

#[test]
fn batch_2_expiration_timestamp_min_matches_sequential() {
    assert_batch_n_expiration_timestamp_min_matches_sequential::<2>();
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
fn inner_2_with_everything_non_empty_matches_sequential_kernels() {
    assert_inner_n_with_everything_non_empty_matches_sequential_kernels::<2>();
}

#[test]
fn inner_2_is_private_only_matches_sequential() {
    assert_inner_n_is_private_only_matches_sequential::<2>();
}

#[test]
fn inner_2_expiration_timestamp_min_matches_sequential() {
    assert_inner_n_expiration_timestamp_min_matches_sequential::<2>();
}

#[test]
fn inner_2_fee_payer_midbatch_matches_sequential() {
    assert_inner_n_fee_payer_midbatch_matches_sequential::<2>();
}

#[test]
fn inner_2_public_teardown_midbatch_matches_sequential() {
    assert_inner_n_public_teardown_midbatch_matches_sequential::<2>();
}

#[test]
fn inner_2_min_revertible_midbatch_matches_sequential() {
    assert_inner_n_min_revertible_midbatch_matches_sequential::<2>();
}

#[test]
fn inner_2_depth_first_child_keeps_sibling_on_stack() {
    assert_inner_n_depth_first_child_keeps_sibling_on_stack::<2>();
}

#[test]
fn inner_2_depth_first_with_sibling_matches_sequential_kernels() {
    assert_inner_n_depth_first_with_sibling_matches_sequential_kernels::<2>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn inner_2_salt_mismatch_rejected() {
    assert_inner_n_salt_mismatch_rejected::<2>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn inner_2_anchor_mismatch_rejected() {
    assert_inner_n_anchor_mismatch_rejected::<2>();
}

#[test(should_fail_with = "mismatch tx context")]
fn inner_2_tx_context_mismatch_rejected() {
    assert_inner_n_tx_context_mismatch_rejected::<2>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn inner_2_claimed_lengths_are_validated() {
    assert_inner_n_claimed_lengths_are_validated::<2>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn inner_2_side_effect_counters_are_validated() {
    assert_inner_n_side_effect_counters_are_validated::<2>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn inner_2_fee_payer_conflict_fails() {
    assert_inner_n_fee_payer_conflict_fails::<2>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn inner_2_public_teardown_conflict_fails() {
    assert_inner_n_public_teardown_conflict_fails::<2>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn inner_2_min_revertible_conflict_fails() {
    assert_inner_n_min_revertible_conflict_fails::<2>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn inner_2_static_call_restrictions_apply_to_next_slot_fails() {
    assert_inner_n_static_call_restrictions_apply_to_next_slot_fails::<2>();
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

#[test(should_fail_with = "mismatch tx_request_salt")]
fn batch_3_salt_mismatch_rejected() {
    assert_init_n_salt_mismatch_rejected::<3>();
}

#[test(should_fail_with = "mismatch tx context")]
fn batch_3_tx_context_mismatch_rejected() {
    assert_init_n_tx_context_mismatch_rejected::<3>();
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
fn batch_3_is_private_only_matches_sequential() {
    assert_batch_n_is_private_only_matches_sequential::<3>();
}

#[test]
fn batch_3_fee_payer_midbatch_matches_sequential() {
    assert_batch_n_fee_payer_midbatch_matches_sequential::<3>();
}

#[test]
fn batch_3_public_teardown_midbatch_matches_sequential() {
    assert_batch_n_public_teardown_midbatch_matches_sequential::<3>();
}

#[test]
fn batch_3_min_revertible_midbatch_matches_sequential() {
    assert_batch_n_min_revertible_midbatch_matches_sequential::<3>();
}

#[test]
fn batch_3_protocol_nullifier_matches_sequential() {
    assert_batch_n_protocol_nullifier_matches_sequential::<3>();
}

#[test]
fn batch_3_expiration_timestamp_min_matches_sequential() {
    assert_batch_n_expiration_timestamp_min_matches_sequential::<3>();
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

#[test]
fn inner_3_with_everything_non_empty_matches_sequential_kernels() {
    assert_inner_n_with_everything_non_empty_matches_sequential_kernels::<3>();
}

#[test]
fn inner_3_is_private_only_matches_sequential() {
    assert_inner_n_is_private_only_matches_sequential::<3>();
}

#[test]
fn inner_3_expiration_timestamp_min_matches_sequential() {
    assert_inner_n_expiration_timestamp_min_matches_sequential::<3>();
}

#[test]
fn inner_3_fee_payer_midbatch_matches_sequential() {
    assert_inner_n_fee_payer_midbatch_matches_sequential::<3>();
}

#[test]
fn inner_3_public_teardown_midbatch_matches_sequential() {
    assert_inner_n_public_teardown_midbatch_matches_sequential::<3>();
}

#[test]
fn inner_3_min_revertible_midbatch_matches_sequential() {
    assert_inner_n_min_revertible_midbatch_matches_sequential::<3>();
}

#[test]
fn inner_3_depth_first_child_keeps_sibling_on_stack() {
    assert_inner_n_depth_first_child_keeps_sibling_on_stack::<3>();
}

#[test]
fn inner_3_depth_first_with_sibling_matches_sequential_kernels() {
    assert_inner_n_depth_first_with_sibling_matches_sequential_kernels::<3>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn inner_3_salt_mismatch_rejected() {
    assert_inner_n_salt_mismatch_rejected::<3>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn inner_3_anchor_mismatch_rejected() {
    assert_inner_n_anchor_mismatch_rejected::<3>();
}

#[test(should_fail_with = "mismatch tx context")]
fn inner_3_tx_context_mismatch_rejected() {
    assert_inner_n_tx_context_mismatch_rejected::<3>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn inner_3_claimed_lengths_are_validated() {
    assert_inner_n_claimed_lengths_are_validated::<3>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn inner_3_side_effect_counters_are_validated() {
    assert_inner_n_side_effect_counters_are_validated::<3>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn inner_3_fee_payer_conflict_fails() {
    assert_inner_n_fee_payer_conflict_fails::<3>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn inner_3_public_teardown_conflict_fails() {
    assert_inner_n_public_teardown_conflict_fails::<3>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn inner_3_min_revertible_conflict_fails() {
    assert_inner_n_min_revertible_conflict_fails::<3>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn inner_3_static_call_requires_static_nested_private_call_fails() {
    assert_inner_n_static_call_requires_static_nested_private_call_fails::<3>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn inner_3_static_call_restrictions_apply_to_next_slot_fails() {
    assert_inner_n_static_call_restrictions_apply_to_next_slot_fails::<3>();
}

#[test]
fn batch_4_accumulates_side_effects_across_slots() {
    assert_batch_n_accumulates_side_effects_across_slots::<4>();
}

#[test]
fn batch_4_linear_chain_consumes_all_calls() {
    assert_batch_n_linear_chain_consumes_all_calls::<4>();
}

#[test]
fn batch_4_linear_chain_matches_sequential_kernels() {
    assert_batch_n_linear_chain_matches_sequential_kernels::<4>();
}

#[test]
fn batch_4_depth_first_child_keeps_sibling_on_stack() {
    assert_batch_n_depth_first_child_keeps_sibling_on_stack::<4>();
}

#[test]
fn batch_4_depth_first_with_sibling_matches_sequential_kernels() {
    assert_batch_n_depth_first_with_sibling_matches_sequential_kernels::<4>();
}

#[test]
fn batch_4_with_everything_non_empty_matches_sequential_kernels() {
    assert_batch_n_with_everything_non_empty_matches_sequential_kernels::<4>();
}

#[test(should_fail_with = "call_context does not match call request")]
fn batch_4_fourth_call_must_match_third_call_stack_fails() {
    assert_batch_n_last_call_must_match_previous_call_stack_fails::<4>();
}

#[test(should_fail_with = "args_hash does not match call request")]
fn batch_4_second_call_must_match_first_call_stack_fails() {
    assert_batch_n_second_call_must_match_first_call_stack_fails::<4>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn batch_4_second_call_claimed_lengths_are_validated() {
    assert_batch_n_second_call_claimed_lengths_are_validated::<4>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn batch_4_fourth_call_side_effect_counters_are_validated() {
    assert_batch_n_last_call_side_effect_counters_are_validated::<4>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn batch_4_second_call_must_match_previous_kernel_header() {
    assert_batch_n_second_call_must_match_previous_kernel_header::<4>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn batch_4_salt_mismatch_rejected() {
    assert_init_n_salt_mismatch_rejected::<4>();
}

#[test(should_fail_with = "mismatch tx context")]
fn batch_4_tx_context_mismatch_rejected() {
    assert_init_n_tx_context_mismatch_rejected::<4>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_4_fee_payer_conflict_fails() {
    assert_batch_n_fee_payer_conflict_fails::<4>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn batch_4_public_teardown_conflict_fails() {
    assert_batch_n_public_teardown_conflict_fails::<4>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn batch_4_min_revertible_side_effect_counter_conflict_fails() {
    assert_batch_n_min_revertible_side_effect_counter_conflict_fails::<4>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn batch_4_static_call_requires_static_nested_private_call_fails() {
    assert_batch_n_static_call_requires_static_nested_private_call_fails::<4>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn batch_4_static_call_restrictions_apply_to_next_slot_fails() {
    assert_batch_n_static_call_restrictions_apply_to_next_slot_fails::<4>();
}

#[test]
fn batch_4_is_private_only_matches_sequential() {
    assert_batch_n_is_private_only_matches_sequential::<4>();
}

#[test]
fn batch_4_fee_payer_midbatch_matches_sequential() {
    assert_batch_n_fee_payer_midbatch_matches_sequential::<4>();
}

#[test]
fn batch_4_public_teardown_midbatch_matches_sequential() {
    assert_batch_n_public_teardown_midbatch_matches_sequential::<4>();
}

#[test]
fn batch_4_min_revertible_midbatch_matches_sequential() {
    assert_batch_n_min_revertible_midbatch_matches_sequential::<4>();
}

#[test]
fn batch_4_protocol_nullifier_matches_sequential() {
    assert_batch_n_protocol_nullifier_matches_sequential::<4>();
}

#[test]
fn batch_4_expiration_timestamp_min_matches_sequential() {
    assert_batch_n_expiration_timestamp_min_matches_sequential::<4>();
}

#[test]
fn inner_4_accumulates_side_effects_after_previous_kernel() {
    assert_inner_n_accumulates_side_effects_after_previous_kernel::<4>();
}

#[test]
fn inner_4_with_previous_side_effects_matches_sequential_kernels() {
    assert_inner_n_with_previous_side_effects_matches_sequential_kernels::<4>();
}

#[test]
fn inner_4_linear_chain_consumes_all_calls() {
    assert_inner_n_linear_chain_consumes_all_calls::<4>();
}

#[test]
fn inner_4_linear_chain_matches_sequential_kernels() {
    assert_inner_n_linear_chain_matches_sequential_kernels::<4>();
}

#[test]
fn inner_4_with_everything_non_empty_matches_sequential_kernels() {
    assert_inner_n_with_everything_non_empty_matches_sequential_kernels::<4>();
}

#[test]
fn inner_4_is_private_only_matches_sequential() {
    assert_inner_n_is_private_only_matches_sequential::<4>();
}

#[test]
fn inner_4_expiration_timestamp_min_matches_sequential() {
    assert_inner_n_expiration_timestamp_min_matches_sequential::<4>();
}

#[test]
fn inner_4_fee_payer_midbatch_matches_sequential() {
    assert_inner_n_fee_payer_midbatch_matches_sequential::<4>();
}

#[test]
fn inner_4_public_teardown_midbatch_matches_sequential() {
    assert_inner_n_public_teardown_midbatch_matches_sequential::<4>();
}

#[test]
fn inner_4_min_revertible_midbatch_matches_sequential() {
    assert_inner_n_min_revertible_midbatch_matches_sequential::<4>();
}

#[test]
fn inner_4_depth_first_child_keeps_sibling_on_stack() {
    assert_inner_n_depth_first_child_keeps_sibling_on_stack::<4>();
}

#[test]
fn inner_4_depth_first_with_sibling_matches_sequential_kernels() {
    assert_inner_n_depth_first_with_sibling_matches_sequential_kernels::<4>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn inner_4_salt_mismatch_rejected() {
    assert_inner_n_salt_mismatch_rejected::<4>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn inner_4_anchor_mismatch_rejected() {
    assert_inner_n_anchor_mismatch_rejected::<4>();
}

#[test(should_fail_with = "mismatch tx context")]
fn inner_4_tx_context_mismatch_rejected() {
    assert_inner_n_tx_context_mismatch_rejected::<4>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn inner_4_claimed_lengths_are_validated() {
    assert_inner_n_claimed_lengths_are_validated::<4>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn inner_4_side_effect_counters_are_validated() {
    assert_inner_n_side_effect_counters_are_validated::<4>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn inner_4_fee_payer_conflict_fails() {
    assert_inner_n_fee_payer_conflict_fails::<4>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn inner_4_public_teardown_conflict_fails() {
    assert_inner_n_public_teardown_conflict_fails::<4>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn inner_4_min_revertible_conflict_fails() {
    assert_inner_n_min_revertible_conflict_fails::<4>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn inner_4_static_call_requires_static_nested_private_call_fails() {
    assert_inner_n_static_call_requires_static_nested_private_call_fails::<4>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn inner_4_static_call_restrictions_apply_to_next_slot_fails() {
    assert_inner_n_static_call_restrictions_apply_to_next_slot_fails::<4>();
}

#[test]
fn batch_5_accumulates_side_effects_across_slots() {
    assert_batch_n_accumulates_side_effects_across_slots::<5>();
}

#[test]
fn batch_5_linear_chain_consumes_all_calls() {
    assert_batch_n_linear_chain_consumes_all_calls::<5>();
}

#[test]
fn batch_5_linear_chain_matches_sequential_kernels() {
    assert_batch_n_linear_chain_matches_sequential_kernels::<5>();
}

#[test]
fn batch_5_depth_first_child_keeps_sibling_on_stack() {
    assert_batch_n_depth_first_child_keeps_sibling_on_stack::<5>();
}

#[test]
fn batch_5_depth_first_with_sibling_matches_sequential_kernels() {
    assert_batch_n_depth_first_with_sibling_matches_sequential_kernels::<5>();
}

#[test]
fn batch_5_with_everything_non_empty_matches_sequential_kernels() {
    assert_batch_n_with_everything_non_empty_matches_sequential_kernels::<5>();
}

#[test(should_fail_with = "call_context does not match call request")]
fn batch_5_fifth_call_must_match_fourth_call_stack_fails() {
    assert_batch_n_last_call_must_match_previous_call_stack_fails::<5>();
}

#[test(should_fail_with = "args_hash does not match call request")]
fn batch_5_second_call_must_match_first_call_stack_fails() {
    assert_batch_n_second_call_must_match_first_call_stack_fails::<5>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn batch_5_second_call_claimed_lengths_are_validated() {
    assert_batch_n_second_call_claimed_lengths_are_validated::<5>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn batch_5_fifth_call_side_effect_counters_are_validated() {
    assert_batch_n_last_call_side_effect_counters_are_validated::<5>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn batch_5_second_call_must_match_previous_kernel_header() {
    assert_batch_n_second_call_must_match_previous_kernel_header::<5>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn batch_5_salt_mismatch_rejected() {
    assert_init_n_salt_mismatch_rejected::<5>();
}

#[test(should_fail_with = "mismatch tx context")]
fn batch_5_tx_context_mismatch_rejected() {
    assert_init_n_tx_context_mismatch_rejected::<5>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn batch_5_fee_payer_conflict_fails() {
    assert_batch_n_fee_payer_conflict_fails::<5>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn batch_5_public_teardown_conflict_fails() {
    assert_batch_n_public_teardown_conflict_fails::<5>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn batch_5_min_revertible_side_effect_counter_conflict_fails() {
    assert_batch_n_min_revertible_side_effect_counter_conflict_fails::<5>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn batch_5_static_call_requires_static_nested_private_call_fails() {
    assert_batch_n_static_call_requires_static_nested_private_call_fails::<5>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn batch_5_static_call_restrictions_apply_to_next_slot_fails() {
    assert_batch_n_static_call_restrictions_apply_to_next_slot_fails::<5>();
}

#[test]
fn batch_5_is_private_only_matches_sequential() {
    assert_batch_n_is_private_only_matches_sequential::<5>();
}

#[test]
fn batch_5_fee_payer_midbatch_matches_sequential() {
    assert_batch_n_fee_payer_midbatch_matches_sequential::<5>();
}

#[test]
fn batch_5_public_teardown_midbatch_matches_sequential() {
    assert_batch_n_public_teardown_midbatch_matches_sequential::<5>();
}

#[test]
fn batch_5_min_revertible_midbatch_matches_sequential() {
    assert_batch_n_min_revertible_midbatch_matches_sequential::<5>();
}

#[test]
fn batch_5_protocol_nullifier_matches_sequential() {
    assert_batch_n_protocol_nullifier_matches_sequential::<5>();
}

#[test]
fn batch_5_expiration_timestamp_min_matches_sequential() {
    assert_batch_n_expiration_timestamp_min_matches_sequential::<5>();
}

#[test]
fn inner_5_accumulates_side_effects_after_previous_kernel() {
    assert_inner_n_accumulates_side_effects_after_previous_kernel::<5>();
}

#[test]
fn inner_5_with_previous_side_effects_matches_sequential_kernels() {
    assert_inner_n_with_previous_side_effects_matches_sequential_kernels::<5>();
}

#[test]
fn inner_5_linear_chain_consumes_all_calls() {
    assert_inner_n_linear_chain_consumes_all_calls::<5>();
}

#[test]
fn inner_5_linear_chain_matches_sequential_kernels() {
    assert_inner_n_linear_chain_matches_sequential_kernels::<5>();
}

#[test]
fn inner_5_with_everything_non_empty_matches_sequential_kernels() {
    assert_inner_n_with_everything_non_empty_matches_sequential_kernels::<5>();
}

#[test]
fn inner_5_is_private_only_matches_sequential() {
    assert_inner_n_is_private_only_matches_sequential::<5>();
}

#[test]
fn inner_5_expiration_timestamp_min_matches_sequential() {
    assert_inner_n_expiration_timestamp_min_matches_sequential::<5>();
}

#[test]
fn inner_5_fee_payer_midbatch_matches_sequential() {
    assert_inner_n_fee_payer_midbatch_matches_sequential::<5>();
}

#[test]
fn inner_5_public_teardown_midbatch_matches_sequential() {
    assert_inner_n_public_teardown_midbatch_matches_sequential::<5>();
}

#[test]
fn inner_5_min_revertible_midbatch_matches_sequential() {
    assert_inner_n_min_revertible_midbatch_matches_sequential::<5>();
}

#[test]
fn inner_5_depth_first_child_keeps_sibling_on_stack() {
    assert_inner_n_depth_first_child_keeps_sibling_on_stack::<5>();
}

#[test]
fn inner_5_depth_first_with_sibling_matches_sequential_kernels() {
    assert_inner_n_depth_first_with_sibling_matches_sequential_kernels::<5>();
}

#[test(should_fail_with = "mismatch tx_request_salt")]
fn inner_5_salt_mismatch_rejected() {
    assert_inner_n_salt_mismatch_rejected::<5>();
}

#[test(should_fail_with = "anchor block header mismatch")]
fn inner_5_anchor_mismatch_rejected() {
    assert_inner_n_anchor_mismatch_rejected::<5>();
}

#[test(should_fail_with = "mismatch tx context")]
fn inner_5_tx_context_mismatch_rejected() {
    assert_inner_n_tx_context_mismatch_rejected::<5>();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn inner_5_claimed_lengths_are_validated() {
    assert_inner_n_claimed_lengths_are_validated::<5>();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn inner_5_side_effect_counters_are_validated() {
    assert_inner_n_side_effect_counters_are_validated::<5>();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn inner_5_fee_payer_conflict_fails() {
    assert_inner_n_fee_payer_conflict_fails::<5>();
}

#[test(should_fail_with = "Public teardown call request already set")]
fn inner_5_public_teardown_conflict_fails() {
    assert_inner_n_public_teardown_conflict_fails::<5>();
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn inner_5_min_revertible_conflict_fails() {
    assert_inner_n_min_revertible_conflict_fails::<5>();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn inner_5_static_call_requires_static_nested_private_call_fails() {
    assert_inner_n_static_call_requires_static_nested_private_call_fails::<5>();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn inner_5_static_call_restrictions_apply_to_next_slot_fails() {
    assert_inner_n_static_call_restrictions_apply_to_next_slot_fails::<5>();
}

#[test(should_fail_with = "private calls must be processed in increasing side_effect_counter order")]
fn inner_non_increasing_side_effect_order_is_rejected() {
    let (inputs, hints) = non_side_effect_ordered_inner_scenario();
    drive_inner_with_hints(inputs, hints);
}

#[test(should_fail_with = "cannot pop more nested calls than exist")]
fn init_over_consume_app_call_requests() {
    // C claims to be popped from A (source 1) instead of B (source 2); A only has one child.
    drive_init_with_hints(
        init_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [0, 1, 1] },
    );
}

#[test(should_fail_with = "cannot pop more nested calls than exist")]
fn inner_over_consume_app_call_requests() {
    // call2 claims to be popped from call0 (source 1); call0 only has one child.
    drive_inner_with_hints(
        inner_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [0, 1, 1] },
    );
}

#[test(should_fail_with = "cannot pop more than the previous stack holds")]
fn inner_over_consume_previous_stack() {
    // Two calls claim to be popped from the previous kernel stack, which holds only one request.
    drive_inner_with_hints(
        inner_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [0, 0, 2] },
    );
}

#[test(should_fail_with = "cannot pop more than the previous stack holds")]
fn init_consume_from_empty_previous_stack() {
    // B claims to be popped from the previous stack (source 0), but the init kernel's stack is empty.
    drive_init_with_hints(
        init_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [0, 0, 2] },
    );
}

#[test(should_fail_with = "private call stack length mismatch")]
fn init_dropped_call_rejected() {
    // Depth-first-with-sibling shape leaves exactly one call (the sibling) on the output stack.
    // Honest hints, but the prover drops that pending call from the output stack.
    let inputs = BatchNTestBuilder::<3>::new().inputs_with_shape(true, true);
    let mut output = compose_init(inputs);
    // Safety: honest hints for this shape.
    let hints = unsafe { simulate_pop_sequence(inputs.private_calls) };

    assert_eq(output.end.private_call_stack.length, 1, "expected one pending call on the stack");
    output.end.private_call_stack.length = 0;

    validate_init(inputs, output, hints);
}

#[test(should_fail_with = "private call stack prev_kernel segment mismatch")]
fn inner_prev_segment_tampered_rejected() {
    let (inputs, hints) = inner_prev_remainder_scenario();
    let mut output = compose_inner(inputs);

    // X is the bottom (carried-forward) entry; corrupt its contents.
    assert_eq(output.end.private_call_stack.length, 1, "expected X left on the stack");
    let mut pending = output.end.private_call_stack.array[0];
    pending.args_hash += 1;
    output.end.private_call_stack.array[0] = pending;

    validate_inner(inputs, output, hints);
}

#[test(should_fail_with = "i-th private call can only pop from private calls at index <= i-1")]
fn inner_forward_source_rejected() {
    // call0 claims to be popped from itself (source 1). The consumed counts match the honest run
    // (consumed = [1,1,1,0]), so the stack segment-map passes and the `hint_i <= i` check is the
    // first to reject.
    drive_inner_with_hints(
        inner_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [1, 0, 2] },
    );
}

#[test(should_fail_with = "i-th private call can only pop from private calls at index <= i-1")]
fn init_forward_source_rejected() {
    // B (index 1) claims to be popped from B itself (source 2). The consumed counts still match the
    // honest run (consumed = [0,1,1,0]), so the stack segment-map passes and `hint_1 <= 1` rejects.
    // (In init, hint[0] is unchecked since the root is not popped, so the forward reference must be
    // at index >= 1.)
    drive_init_with_hints(
        init_linear_chain_inputs(),
        PrivateCallStackBatchHints { popped_from_source: [0, 2, 1] },
    );
}

#[test(should_fail_with = "private call stack app segment mismatch")]
fn init_app_segment_tampered_rejected() {
    // Depth-first-with-sibling leaves the sibling request on the output stack (one app segment).
    // Honest hints, but the prover corrupts the contents of that carried-forward request.
    let inputs = BatchNTestBuilder::<3>::new().inputs_with_shape(true, true);
    let mut output = compose_init(inputs);
    // Safety: honest hints for this shape.
    let hints = unsafe { simulate_pop_sequence(inputs.private_calls) };

    assert_eq(output.end.private_call_stack.length, 1, "expected one pending call on the stack");
    let mut pending = output.end.private_call_stack.array[0];
    pending.args_hash += 1;
    output.end.private_call_stack.array[0] = pending;

    validate_init(inputs, output, hints);
}

// The batched validator accepts the non-canonical global ordering [A, B, C] then [D]: kernel 1
// processes A, B, C and defers B's child D to the output stack; kernel 2 then processes D. The
// global pop order is A(2), B(10), C(40), D(15) -- D runs AFTER C even though D's start counter (15)
// is below C's (40). The legacy sequential kernel rejects this run (it must pop the live stack top,
// i.e. D before C); the batched validator's ordering check is intra-kernel only, so it accepts.
//
// This is safe (the final tx is a function of the executed-call multiset, which is preserved, not of
// the accumulation order); the test documents that the ordering is nonetheless accepted. An honest
// prover never produces it: `simulate_pop_sequence` and the pop-top composer both emit the canonical
// A, B, D, C order, so the deferred output stack is patched in by hand here.
#[test]
fn cross_kernel_deferred_order_a_b_c_then_d_is_accepted() {
    let (inputs1, hints1, d) = deferred_grandchild_init_scenario();

    // Kernel 1 (init): process [A, B, C]. Take the composer's (accumulation-order-independent)
    // arrays, then patch the output stack to what a deferring prover claims: B's unconsumed child D.
    let mut output1 = compose_init(inputs1);
    output1.end.private_call_stack.array[0] = d.to_private_call_request();
    output1.end.private_call_stack.length = 1;

    validate_init(inputs1, output1, hints1);

    assert_eq(output1.end.private_call_stack.length, 1, "expected D deferred on the stack");
    assert_eq(
        output1.end.private_call_stack.array[0].start_side_effect_counter,
        15,
        "the deferred call should be D",
    );

    // Kernel 2 (inner): process [D] popped from kernel 1's output stack. The stack empties, so the
    // transaction can proceed to tail -- the deferred D is eventually executed.
    let inputs2 = PrivateKernelInnerNCircuitPrivateInputs {
        previous_kernel: private_kernel_data_with_vk_index(output1, PRIVATE_KERNEL_INIT_VK_INDEX),
        private_calls: [d.to_private_call_data()],
    };
    drive_inner_with_hints(
        inputs2,
        PrivateCallStackBatchHints { popped_from_source: [0] },
    );
}
