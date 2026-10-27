mod validate_accumulated_items;
mod validate_unsquashable_note_hash_nullifier_ordering;

use types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::Empty,
};
use validate_accumulated_items::validate_accumulated_items;
use validate_unsquashable_note_hash_nullifier_ordering::validate_unsquashable_note_hash_nullifier_ordering;

/// Validate the previous kernel for a private tail, either to_rollup or to_public.
/// `is_for_public` should be known at compile time.
pub fn validate_previous_kernel_for_tail(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    is_for_public: bool,
) {
    // --- constants ---
    // There's no restriction on the specific values of the constants.

    // --- min_revertible_side_effect_counter ---

    let min_revertible_side_effect_counter =
        previous_kernel_public_inputs.min_revertible_side_effect_counter;

    // Here, we finally reconcile that the "claimed" revertible counter (as hinted by all app circuits
    // and kernel iterations of this tx) actually reconciles with the min_revertible_side_effect counter
    // that was set by one of the app circuits of this tx.
    //
    // The Init circuit checks `claimed_revertible_counter` (see `validate_as_first_call`): it is 0 only when
    // `is_private_only`, and otherwise greater than 2, above the reserved side-effect counters (0 unused, 1 the
    // protocol nullifier, 2 the start counter of the first call). Every kernel iteration propagates both values
    // unchanged, and tail-to-public asserts `!is_private_only` below. So this equality also establishes that a
    // tx with public calls has `min_revertible_side_effect_counter > 2`, and that a private-only tx has it
    // either unset (0, no private call ended the setup phase and every side effect is non-revertible) or
    // greater than 2. Independently of that chain, the first-nullifier check below forces
    // `min_revertible_side_effect_counter >= 2` for tail-to-public within this circuit alone, since no
    // nullifier counter is below 1.
    assert_eq(
        previous_kernel_public_inputs.claimed_revertible_counter,
        min_revertible_side_effect_counter,
        "claimed_revertible_counter does not match min_revertible_side_effect_counter",
    );

    // --- validation_requests ---

    let validation_requests = previous_kernel_public_inputs.validation_requests;

    assert_eq(
        validation_requests.note_hash_read_requests.length,
        0,
        "Non empty note hash read requests",
    );
    assert_eq(
        validation_requests.nullifier_read_requests.length,
        0,
        "Non empty nullifier read requests",
    );
    assert_eq(
        validation_requests.scoped_key_validation_requests_and_separators.length,
        0,
        "Non empty key validation requests",
    );

    // --- fee_payer ---

    let fee_payer = previous_kernel_public_inputs.fee_payer;

    assert(!fee_payer.is_empty(), "Fee payer can't be empty");

    // --- expiration_timestamp ---
    // It's checked against the given upper bound and the output value in the output validator.

    // --- is_private_only ---

    let is_private_only = previous_kernel_public_inputs.is_private_only;
    if is_for_public {
        assert(!is_private_only, "Must not be private only to be processed in tail to public");
    } else {
        assert(is_private_only, "Must be private only to be processed in tail");
    }

    // --- first nullifier ---

    assert(
        previous_kernel_public_inputs.end.nullifiers.length != 0,
        "TX must create at least one nullifier",
    );

    if is_for_public {
        let first_nullifier = previous_kernel_public_inputs.end.nullifiers.array[0];
        assert(
            first_nullifier.inner.counter < min_revertible_side_effect_counter,
            "First nullifier must be non revertible",
        );
    }

    // --- end & public_teardown_call_request ---
    let private_logs = previous_kernel_public_inputs.end.private_logs;
    let contract_class_logs_hashes = previous_kernel_public_inputs.end.contract_class_logs_hashes;
    let l2_to_l1_msgs = previous_kernel_public_inputs.end.l2_to_l1_msgs;
    let private_call_stack = previous_kernel_public_inputs.end.private_call_stack;
    let public_call_requests = previous_kernel_public_inputs.end.public_call_requests;
    let public_teardown_call_request = previous_kernel_public_inputs.public_teardown_call_request;

    validate_accumulated_items(previous_kernel_public_inputs, is_for_public);

    l2_to_l1_msgs.for_each(|msg| msg.innermost().recipient.validate());

    validate_unsquashable_note_hash_nullifier_ordering(
        previous_kernel_public_inputs,
        is_for_public,
    );

    for private_log in private_logs.array {
        assert(
            private_log.innermost().log.length <= PRIVATE_LOG_SIZE_IN_FIELDS,
            "Private log length exceeds max",
        );
    }

    for contract_class_log in contract_class_logs_hashes.array {
        assert(
            contract_class_log.innermost().length <= CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
            "Contract class log length exceeds max",
        );
    }

    assert_eq(
        private_call_stack.length,
        0,
        "Private call stack must be empty when executing the tail circuit",
    );

    if is_for_public {
        assert(
            (public_call_requests.length != 0) | !public_teardown_call_request.is_empty(),
            "Must have public calls when exporting public kernel data from the tail circuit",
        );
    } else {
        // Empty public call requests validated in validate_accumulated_items
        public_teardown_call_request.assert_empty(
            "Public teardown call request must be empty when executing the tail circuit",
        );
    }
}
