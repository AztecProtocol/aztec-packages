mod validate_accumulated_items;
mod validate_no_transient_data;
mod validate_siloed_values;

use types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::Empty,
};
use validate_accumulated_items::validate_accumulated_items;
use validate_no_transient_data::validate_no_transient_data;
use validate_siloed_values::validate_siloed_values;

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

    if is_for_public {
        assert(
            min_revertible_side_effect_counter != 0,
            "min_revertible_side_effect_counter must not be 0 for tail_to_public",
        );
    } else {
        // The `min_revertible_side_effect_counter` could be anything for a pure private tx, as it's not used in the
        // tail circuit or any circuits before the tail.
    }

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
        validation_requests.scoped_key_validation_requests_and_generators.length,
        0,
        "Non empty key validation requests",
    );

    // --- fee_payer ---

    let fee_payer = previous_kernel_public_inputs.fee_payer;
    // TODO: use assert_not_empty after Noir #9002.
    assert(!fee_payer.is_empty(), "Fee payer can't be empty");

    // --- include_by_timestamp ---
    // It's checked against the given upper bound and the output value in the output validator.

    // --- is_private_only ---

    let is_private_only = previous_kernel_public_inputs.is_private_only;
    if is_for_public {
        assert(!is_private_only, "Must not be private only to be processed in tail to public");
    } else {
        assert(is_private_only, "Must be private only to be processed in tail");
    }

    // --- claimed_first_nullifier ---

    assert(
        previous_kernel_public_inputs.end.nullifiers.length != 0,
        "TX must create at least one nullifier",
    );

    let claimed_first_nullifier = previous_kernel_public_inputs.claimed_first_nullifier;

    let first_nullifier = previous_kernel_public_inputs.end.nullifiers.array[0];
    assert_eq(
        claimed_first_nullifier,
        first_nullifier.innermost().value,
        "First nullifier claim was not satisfied",
    );

    if is_for_public {
        assert(
            first_nullifier.inner.counter < min_revertible_side_effect_counter,
            "First nullifier must be non revertible",
        );
    }

    // --- end & public_teardown_call_request ---
    let note_hashes = previous_kernel_public_inputs.end.note_hashes;
    let nullifiers = previous_kernel_public_inputs.end.nullifiers;
    let private_logs = previous_kernel_public_inputs.end.private_logs;
    let contract_class_logs_hashes = previous_kernel_public_inputs.end.contract_class_logs_hashes;
    let private_call_stack = previous_kernel_public_inputs.end.private_call_stack;
    let public_call_requests = previous_kernel_public_inputs.end.public_call_requests;
    let public_teardown_call_request = previous_kernel_public_inputs.public_teardown_call_request;

    validate_accumulated_items(previous_kernel_public_inputs, is_for_public);

    validate_siloed_values(note_hashes, "note hashes");
    validate_siloed_values(nullifiers, "nullifiers");
    validate_siloed_values(private_logs, "private logs");

    validate_no_transient_data(previous_kernel_public_inputs);

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
        public_teardown_call_request.assert_empty(
            "Public teardown call request must be empty when executing the tail circuit",
        );
    }
}
