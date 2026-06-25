use crate::{
    accumulated_data::{assert_array_concat_appended, assert_array_concat_appended_and_scoped},
    components::private_kernel_circuit_output_composer::get_expiration_timestamp_for_contract_updates::get_expiration_timestamp_for_contract_updates,
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, nullifier::Nullifier,
        private_call_request::PrivateCallRequest,
        private_kernel::private_call_data::PrivateCallData,
        private_tx_constant_data::PrivateTxConstantData, protocol_contracts::ProtocolContracts,
        public_call_request::PublicCallRequest, transaction::tx_request::TxRequest,
    },
    address::AztecAddress,
    constants::{
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    },
    hash::compute_protocol_nullifier,
    side_effect::{Counted, Scoped},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// For EACH private call popped from the execution stack, the source index it pops from.
///   0           = `prev_kernel.private_call_stack`
///   `j + 1`     = `private_calls[j].public_inputs.private_call_requests`
pub struct PrivateCallStackBatchHints<let M: u32> {
    pub popped_from_source: [u32; M],
}

/// Given N private calls coming from a DFS of the private calls in the transaction, determine the source of each of them.
///
/// If T is the tree of private calls, private_calls = DFS_N(T) is the DFS of T of length N, then this function returns an
/// array src s.t. src[i] is the index of the parent of private_calls[i] in T.
///
/// For example, consider the following tree of private calls for a transaction
///                 *
///               / | \
///              a  b  c
///             / \ |  |
///            d  e f  g
/// For N = 3 we have l = [a, d, e], and src = [0, 1, 1].
///
/// Note: This function returns the correct result only if the private_calls come from a DFS of the private calls in the
/// transaction. This is OK, as it is an unconstrained function, and its output gets validated by the batch validator.
pub unconstrained fn simulate_pop_sequence<let N: u32>(
    private_calls: [PrivateCallData; N],
) -> PrivateCallStackBatchHints<N> {
    let mut popped_from_source = [0; N];
    // unaccounted_children[i] = number of children of i-th node in the tree which have not been encountered yet
    let mut unaccounted_children: [u32; N] = [0; N];

    // The source of the i-th private_call is in [0, i-1].
    // To find the correct index, we scan a vector keeping track of the unaccounted children for each source.
    // The index we are looking for is the last non-zero index.
    for i in 0..N {
        let mut src: u32 = 0;
        let mut is_parent_root = true;

        for j in 0..N {
            if unaccounted_children[j] > 0 {
                src = j as u32;
                is_parent_root = false;
            }
        }

        if (is_parent_root) {
            popped_from_source[i] = 0;
        } else {
            popped_from_source[i] = src + 1;
            unaccounted_children[src] -= 1;
        }

        let nested_len = private_calls[i].public_inputs.private_call_requests.length;
        unaccounted_children[i] = nested_len;
    }

    PrivateCallStackBatchHints { popped_from_source }
}

/// Initial values for the four "set-once" aggregated fields that accumulate across kernel iterations.
///
/// The inner kernel seeds these from `previous_kernel`; the init kernel seeds them with the trivial
/// defaults (no prior state). Packaging them keeps the call sites legible: `empty_for_init()` vs.
/// `from_previous_kernel(...)` makes the asymmetry explicit instead of hiding it behind four
/// "default" scalar arguments at the call site.
struct AggregatedSeeds {
    min_revertible_side_effect_counter: u32,
    expiration_timestamp: u64,
    public_teardown_call_request: PublicCallRequest,
    fee_payer: AztecAddress,
}

impl AggregatedSeeds {
    fn empty_for_init() -> Self {
        AggregatedSeeds {
            min_revertible_side_effect_counter: 0,
            expiration_timestamp: types::constants::MAX_U64_VALUE,
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::zero(),
        }
    }

    fn from_previous_kernel(previous_kernel: PrivateKernelCircuitPublicInputs) -> Self {
        AggregatedSeeds {
            min_revertible_side_effect_counter: previous_kernel.min_revertible_side_effect_counter,
            expiration_timestamp: previous_kernel.expiration_timestamp,
            public_teardown_call_request: previous_kernel.public_teardown_call_request,
            fee_payer: previous_kernel.fee_payer,
        }
    }
}

/// Batched output validator for the Private Kernel Init/Inner circuits.
///
/// Holds the composed `output`, the N `private_calls` that produced it, and the prover-supplied
/// `popped_from_source` hints. `validate_as_inner` and `validate_as_init` are the two public entry
/// points
pub struct PrivateKernelBatchValidator<let N: u32> {
    output: PrivateKernelCircuitPublicInputs,
    private_calls: [PrivateCallData; N],
    hints: PrivateCallStackBatchHints<N>,
}

impl<let N: u32> PrivateKernelBatchValidator<N> {
    pub fn new(
        output: PrivateKernelCircuitPublicInputs,
        private_calls: [PrivateCallData; N],
        hints: PrivateCallStackBatchHints<N>,
    ) -> Self {
        PrivateKernelBatchValidator { output, private_calls, hints }
    }

    /// Inner batched output validator.
    ///
    /// Validates the final output produced by `compose_inner_batch_n` against the original previous
    /// kernel and N private_calls in a single shot:
    ///   - constants and tx-level scalar hints (4 asserts);
    ///   - aggregated scalar reductions (min_revertible, expiration_timestamp,
    ///     public_teardown_call_request, fee_payer);
    ///   - 9 non-stack accumulator arrays via `assert_array_concat_appended[_and_scoped]`;
    ///   - private_call_stack via segment-mapping using prover-supplied `popped_from_source` hints.
    pub fn validate_as_inner(
        self,
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) -> [PrivateCallRequest; N] {
        assert_eq(self.output.constants, previous_kernel.constants, "mismatch constants");

        self.validate_aggregated_values(
            AggregatedSeeds::from_previous_kernel(previous_kernel),
            previous_kernel.is_private_only,
            previous_kernel.claimed_revertible_counter,
        );

        self.validate_non_stack_arrays(previous_kernel);

        self.validate_final_call_stack::<0>(previous_kernel.end.private_call_stack);

        let popped = self.derive_popped_requests::<0>(previous_kernel.end.private_call_stack);
        self.validate_hints_and_popped_requests_order::<0>(popped);
        popped
    }

    /// Init batched output validator.
    ///
    /// Mirrors `validate_as_inner` but seeds the constants from `tx_request` + app[0] and
    /// handles the optional protocol-nullifier slot at `output.end.nullifiers.array[0]` via a length-1
    /// prepended segment. App 0 is responsible for `validate_as_first_call`; apps 1..N use
    /// `validate_as_inner_call_against_request` against this validator's returned popped requests.
    pub fn validate_as_init(
        self,
        tx_request: TxRequest,
        vk_tree_root: Field,
        protocol_contracts: ProtocolContracts,
        is_private_only: bool,
        first_nullifier_hint: Field,
        revertible_counter_hint: u32,
    ) -> [PrivateCallRequest; N] {
        let expected_constants = PrivateTxConstantData {
            tx_context: self.private_calls[0].public_inputs.tx_context,
            vk_tree_root,
            protocol_contracts,
            anchor_block_header: self.private_calls[0].public_inputs.anchor_block_header,
        };
        assert_eq(self.output.constants, expected_constants, "mismatch constants");

        self.validate_aggregated_values(
            AggregatedSeeds::empty_for_init(),
            is_private_only,
            revertible_counter_hint,
        );

        let init_prev_state = self.build_init_prev_state(tx_request, first_nullifier_hint);
        self.validate_non_stack_arrays(init_prev_state);

        let empty_prev_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX> =
            ClaimedLengthArray::empty();
        self.validate_final_call_stack::<1>(empty_prev_stack);

        let popped = self.derive_popped_requests::<1>(empty_prev_stack);
        self.validate_hints_and_popped_requests_order::<1>(popped);
        popped
    }

    /// Validate values are updated correctly according to the private_calls being executed. All constants
    /// either start from the previous kernel's state or from a default value seeded by the Init kernel
    ///  - min_revertible_side_effect_counter: can only be set once; starts from 0 (for Init)
    ///  - expiration_timestamp: minimum across the private calls expiration timestamps and the contract
    ///    updates' expiration timestamps; starts from MAX_U64_VALUE for Init
    ///  - public_teardown_call_request: can only be set once; starts from empty for Init
    ///  - fee_payer: can only be set once; starts from zero for Init
    ///  - is_private_only, claimed_revertible_counter: set by Init and must be
    ///    propagated without modification
    fn validate_aggregated_values(
        self,
        seeds: AggregatedSeeds,
        is_private_only: bool,
        revertible_counter_hint: u32,
    ) {
        let mut min_revertible = seeds.min_revertible_side_effect_counter;
        for i in 0..N {
            let c = self.private_calls[i].public_inputs.min_revertible_side_effect_counter;
            if c != 0 {
                assert(min_revertible == 0, "cannot overwrite min_revertible_side_effect_counter");
                min_revertible = c;
            }
        }
        assert_eq(
            self.output.min_revertible_side_effect_counter,
            min_revertible,
            "incorrect output min_revertible_side_effect_counter",
        );

        let mut expiration_timestamp = seeds.expiration_timestamp;
        for i in 0..N {
            expiration_timestamp = std::cmp::min(
                expiration_timestamp,
                std::cmp::min(
                    self.private_calls[i].public_inputs.expiration_timestamp,
                    get_expiration_timestamp_for_contract_updates(self.private_calls[i]),
                ),
            );
        }
        assert_eq(
            self.output.expiration_timestamp,
            expiration_timestamp,
            "incorrect output expiration_timestamp",
        );

        let mut public_teardown = seeds.public_teardown_call_request;
        for i in 0..N {
            let candidate = self.private_calls[i].public_inputs.public_teardown_call_request;
            if !candidate.is_empty() {
                assert(public_teardown.is_empty(), "cannot overwrite public_teardown_call_request");
                public_teardown = candidate;
            }
        }
        assert_eq(
            self.output.public_teardown_call_request,
            public_teardown,
            "incorrect output public_teardown_call_request",
        );

        let mut fee_payer = seeds.fee_payer;
        for i in 0..N {
            if self.private_calls[i].public_inputs.is_fee_payer {
                assert(fee_payer.is_zero(), "cannot overwrite fee_payer");
                fee_payer = self.private_calls[i].public_inputs.call_context.contract_address;
            }
        }
        assert_eq(self.output.fee_payer, fee_payer, "incorrect output fee_payer");

        assert_eq(self.output.is_private_only, is_private_only, "mismatch is_private_only");
        assert_eq(
            self.output.claimed_revertible_counter,
            revertible_counter_hint,
            "mismatch claimed_revertible_counter",
        );
    }

    /// Asserts each of the 9 non-stack accumulator arrays on `output` is the concatenation of the
    /// corresponding array on `prev_state` and the per-private-call arrays.
    ///
    /// The inner kernel passes `previous_kernel` directly. The init kernel passes a synthetic
    /// previous state built by `build_init_prev_state`: all accumulators are empty except
    /// `end.nullifiers`, which carries the protocol-nullifier prepend (length 0 or 1).
    fn validate_non_stack_arrays(self, prev_state: PrivateKernelCircuitPublicInputs) {
        let contract_addresses = self.collect_contract_addresses();

        let mut note_hash_read_requests_sources = [ClaimedLengthArray::empty(); N];
        let mut nullifier_read_requests_sources = [ClaimedLengthArray::empty(); N];
        let mut key_validation_requests_sources = [ClaimedLengthArray::empty(); N];
        let mut note_hashes_sources = [ClaimedLengthArray::empty(); N];
        let mut nullifiers_sources = [ClaimedLengthArray::empty(); N];
        let mut l2_to_l1_msgs_sources = [ClaimedLengthArray::empty(); N];
        let mut private_logs_sources = [ClaimedLengthArray::empty(); N];
        let mut contract_class_logs_sources = [ClaimedLengthArray::empty(); N];
        let mut public_call_requests_sources = [ClaimedLengthArray::empty(); N];

        for i in 0..N {
            let p = self.private_calls[i].public_inputs;
            note_hash_read_requests_sources[i] = p.note_hash_read_requests;
            nullifier_read_requests_sources[i] = p.nullifier_read_requests;
            key_validation_requests_sources[i] = p.key_validation_requests_and_separators;
            note_hashes_sources[i] = p.note_hashes;
            nullifiers_sources[i] = p.nullifiers;
            l2_to_l1_msgs_sources[i] = p.l2_to_l1_msgs;
            private_logs_sources[i] = p.private_logs;
            contract_class_logs_sources[i] = p.contract_class_logs_hashes;
            public_call_requests_sources[i] = p.public_call_requests;
        }

        assert_array_concat_appended(
            self.output.validation_requests.note_hash_read_requests,
            prev_state.validation_requests.note_hash_read_requests,
            note_hash_read_requests_sources,
        );
        assert_array_concat_appended(
            self.output.validation_requests.nullifier_read_requests,
            prev_state.validation_requests.nullifier_read_requests,
            nullifier_read_requests_sources,
        );
        assert_array_concat_appended_and_scoped(
            self.output.validation_requests.scoped_key_validation_requests_and_separators,
            prev_state.validation_requests.scoped_key_validation_requests_and_separators,
            key_validation_requests_sources,
            contract_addresses,
        );
        assert_array_concat_appended_and_scoped(
            self.output.end.note_hashes,
            prev_state.end.note_hashes,
            note_hashes_sources,
            contract_addresses,
        );
        assert_array_concat_appended_and_scoped(
            self.output.end.nullifiers,
            prev_state.end.nullifiers,
            nullifiers_sources,
            contract_addresses,
        );
        assert_array_concat_appended_and_scoped(
            self.output.end.l2_to_l1_msgs,
            prev_state.end.l2_to_l1_msgs,
            l2_to_l1_msgs_sources,
            contract_addresses,
        );
        assert_array_concat_appended_and_scoped(
            self.output.end.private_logs,
            prev_state.end.private_logs,
            private_logs_sources,
            contract_addresses,
        );
        assert_array_concat_appended_and_scoped(
            self.output.end.contract_class_logs_hashes,
            prev_state.end.contract_class_logs_hashes,
            contract_class_logs_sources,
            contract_addresses,
        );
        assert_array_concat_appended(
            self.output.end.public_call_requests,
            prev_state.end.public_call_requests,
            public_call_requests_sources,
        );
    }

    /// Builds the synthetic previous-state used by `validate_as_init` to feed
    /// `validate_non_stack_arrays`. All accumulators are empty except `end.nullifiers`, which
    /// carries the protocol-nullifier prepend (length 1 if `first_nullifier_hint` matches the
    /// protocol nullifier for `tx_request`, length 0 otherwise).
    fn build_init_prev_state(
        self,
        tx_request: TxRequest,
        first_nullifier_hint: Field,
    ) -> PrivateKernelCircuitPublicInputs {
        let mut prev_state = PrivateKernelCircuitPublicInputs::empty_for_init_validation();
        let nullifier_prepend_len = protocol_nullifier_offset_init(
            self.output.end.nullifiers,
            tx_request,
            first_nullifier_hint,
        );
        if nullifier_prepend_len == 1 {
            prev_state.end.nullifiers.array[0] = self.output.end.nullifiers.array[0];
            prev_state.end.nullifiers.length = 1;
        }
        prev_state
    }

    /// Constrained function. Assert that the output_stack is equal to the concatenation of the private calls
    /// that have not been handled.
    ///
    /// Given prev_kernel_stack and private_calls, write consumed for the vector s.t. consumed[i] is the number
    /// of private calls attributed at source i (0 = prev_kernel_stack, j+1 = private_calls[j]) by the prover-supplied
    /// hints. This function enforces that
    ///         output_stack = [prev_kernel_stack[..(length - consumed[0])],
    ///                         private_calls[0].private_call_requests[consumed[1]..].reverse(),
    ///                         ...,
    ///                         private_calls[N-1].private_call_requests[consumed[N]..].reverse()]
    ///
    /// `START` is `0` for the inner kernel and `1` for the init kernel: in the init case the first
    /// private call is not popped (popped[0] is left empty by the caller's contract).
    fn validate_final_call_stack<let START: u32>(
        self,
        prev_kernel_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    ) {
        let output_stack = self.output.end.private_call_stack;

        // `START` is `0` for the inner kernel and `1` for the init kernel: in the init case the first
        // private call is not popped from the (empty) stack.
        let mut consumed: [u32; N + 1] = [0; N + 1];
        for i in START..N {
            // Running this loop is more efficient than directly reading using self.hints.popped_from_source
            // because the latter would result in a ROM gate
            for k in 0..(N + 1) {
                if ((k as u32) == self.hints.popped_from_source[i]) {
                    consumed[k] += 1
                }
            }
        }

        assert(
            consumed[0] <= prev_kernel_stack.length,
            "cannot pop more than the previous stack holds",
        );
        let prev_remaining = prev_kernel_stack.length - consumed[0];

        let mut should_check_prev = true;
        for k in 0..MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX {
            should_check_prev &= k != prev_remaining;
            if should_check_prev {
                // prev_kernel.stack remaining is the bottom slice [0..prev_remaining), in original
                // order (the top of the previous stack was popped first, leaving the bottom items).
                assert_eq(
                    output_stack.array[k],
                    prev_kernel_stack.array[k],
                    "private call stack prev_kernel segment mismatch",
                );
            }
        }

        let mut running_offset = prev_remaining;
        for j in 0..N {
            let nested = self.private_calls[j].public_inputs.private_call_requests;
            assert(consumed[j + 1] <= nested.length, "cannot pop more nested calls than exist");
            let remaining_j = nested.length - consumed[j + 1];
            let mut should_check_j = true;
            for k in 0..MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL {
                should_check_j &= k != remaining_j;
                if should_check_j {
                    // Nested private calls are pushed in reverse order on the stack, so
                    // the k-th call on the stack corresponds to the k-th call from the top
                    // the nested private call array
                    assert_eq(
                        output_stack.array[running_offset + k],
                        nested.array[nested.length - 1 - k],
                        "private call stack app segment mismatch",
                    );
                }
            }
            running_offset += remaining_j;
        }

        assert_eq(output_stack.length, running_offset, "private call stack length mismatch");
    }

    /// Constrained function. Assert that:
    ///  - the source of the i-th private call is either the previous kernel's stack or a private
    ///    call at index <= i-1
    ///  - the private calls are processed in order declared by their side-effect-counters
    ///
    /// Note: this function enforces the private calls' ordering for the current kernel's private calls.
    ///
    /// `START` is `0` for the inner kernel and `1` for the init kernel: in the init case `popped[0]`
    /// is left empty (the first call is the root and is not popped), so the check starts at `START`.
    fn validate_hints_and_popped_requests_order<let START: u32>(
        self,
        popped: [PrivateCallRequest; N],
    ) {
        for i in START..N {
            assert(
                self.hints.popped_from_source[i] <= i,
                "i-th private call can only pop from private calls at index <= i-1",
            );
        }

        for i in (START + 1)..N {
            assert(
                popped[i - 1].start_side_effect_counter < popped[i].start_side_effect_counter,
                "private calls must be processed in increasing side_effect_counter order",
            );
        }
    }

    /// Constrained function. Given the sources from which private calls are popped, derive the private calls.
    ///
    /// `START` is `0` for the inner kernel and `1` for the init kernel: in the init case the first
    /// private call is not popped (popped[0] is left empty by the caller's contract).
    fn derive_popped_requests<let START: u32>(
        self,
        prev_kernel_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    ) -> [PrivateCallRequest; N] {
        // consumed[i] = the number of private calls popped from source i
        let mut consumed: [u32; N + 1] = [0; N + 1];
        // popped[i] = the private call popped at step i
        let mut popped = [PrivateCallRequest::empty(); N];

        for i in START..N {
            let src = self.hints.popped_from_source[i];

            let mut value = PrivateCallRequest::empty();

            // Note: explicitly writing down every condition by checking whether src = 0, 1, .., N+1
            // is more efficient than directly reading based on the value of src because the latter would
            // result in ROM gates

            // Check if the pop is from the previous kernel stack
            let prev_in_range = consumed[0] < prev_kernel_stack.length;
            if (src == 0) & prev_in_range {
                // prev_kernel.stack is in stack order (top at length-1); pop k retrieves length-1-k.
                value = prev_kernel_stack.array[prev_kernel_stack.length - 1 - consumed[0]];
            }

            // If not, determine which app produced the pop
            for j in 0..N {
                let nested = self.private_calls[j].public_inputs.private_call_requests;
                let in_range = consumed[j + 1] < nested.length;
                if ((j as u32 + 1) == src) & in_range {
                    // private_calls[j].public_inputs.private_call_requests is reverse-pushed;
                    // the k-th pop returns the k-th original entry.
                    value = nested.array[consumed[j + 1]];
                }
            }
            popped[i] = value;

            for k in 0..(N + 1) {
                // Running this loop is more efficient than directly reading using self.hints.popped_from_source
                // because the latter would result in a ROM gate
                if ((k as u32) == src) {
                    consumed[k] += 1;
                }
            }
        }

        popped
    }

    fn collect_contract_addresses(self) -> [AztecAddress; N] {
        let mut addrs = [AztecAddress::zero(); N];
        for i in 0..N {
            addrs[i] = self.private_calls[i].public_inputs.call_context.contract_address;
        }
        addrs
    }
}

fn protocol_nullifier_offset_init(
    output_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, MAX_NULLIFIERS_PER_TX>,
    tx_request: TxRequest,
    first_nullifier_hint: Field,
) -> u32 {
    let (scoped_protocol_nullifier, protocol_nullifier) = compute_protocol_nullifier(tx_request);
    if first_nullifier_hint == protocol_nullifier {
        assert_eq(
            output_nullifiers.array[0],
            scoped_protocol_nullifier,
            "incorrect protocol nullifier",
        );
        1
    } else {
        0
    }
}

trait EmptyForInitValidation {
    fn empty_for_init_validation() -> Self;
}

impl EmptyForInitValidation for PrivateKernelCircuitPublicInputs {
    fn empty_for_init_validation() -> Self {
        PrivateKernelCircuitPublicInputs {
            constants: PrivateTxConstantData::empty(),
            min_revertible_side_effect_counter: 0,
            validation_requests: types::abis::validation_requests::PrivateValidationRequests::empty(),
            end: types::abis::accumulated_data::private_accumulated_data::PrivateAccumulatedData::empty(),
            public_teardown_call_request: types::abis::public_call_request::PublicCallRequest::empty(),
            fee_payer: AztecAddress::zero(),
            expiration_timestamp: 0,
            is_private_only: false,
            claimed_revertible_counter: 0,
        }
    }
}
