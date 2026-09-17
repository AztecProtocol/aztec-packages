use crate::accumulated_data::{
    assert_dense_trimmed_array::{self, assert_dense_array},
    assert_trimmed_array,
};
use types::{abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, traits::Empty};

/// Validate that the arrays in the accumulated data are dense trimmed:
/// - Items within `original_array.length` are not empty.
/// - Items beyond `original_array.length` are empty.
///
/// Note: The counters of trimmed items are not checked, since the functions validating these arrays against their
/// outputs do not require non-zero counters. Counters within the claimed length, however, must be non-zero, which is
/// already guaranteed by all preceding kernel circuits.
pub fn validate_accumulated_items(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    is_for_public: bool,
) {
    let note_hashes = previous_kernel_public_inputs.end.note_hashes;
    let nullifiers = previous_kernel_public_inputs.end.nullifiers;
    let l2_to_l1_msgs = previous_kernel_public_inputs.end.l2_to_l1_msgs;
    let private_logs = previous_kernel_public_inputs.end.private_logs;
    let contract_class_logs_hashes = previous_kernel_public_inputs.end.contract_class_logs_hashes;
    let public_call_requests = previous_kernel_public_inputs.end.public_call_requests;

    // For `note_hashes` and `nullifiers`, we only need to check their innermost values to determine whether they are
    // empty or not, since these are the final siloed values that are exposed to the AVM and rollup circuits
    assert_dense_trimmed_array(note_hashes, |note_hash| note_hash.innermost().is_empty());
    assert_dense_trimmed_array(
        nullifiers,
        |nullifier| nullifier.innermost().value.is_empty(),
    );

    // L2 to L1 messages use different predicates for the two halves of the array.
    // Within the claimed length, the contract address must be non-zero: the tx base rollups treat a zero contract
    // address as the end of the array (`private_tx_effect_builder.nr` maps such a message to a zero hash and then
    // derives the message count with `array_length`), so a message scoped to zero but carrying a non-zero recipient or
    // content would truncate the count and silently drop every message after it. A non-zero contract address also makes
    // the exposed form non-empty, which is what the sorted-transform helper's denseness precondition requires.
    // Beyond the claimed length, the entire exposed form must be empty, so that no garbage is propagated to the rollup.
    assert_dense_array(l2_to_l1_msgs, |msg| !msg.contract_address.is_zero());
    assert_trimmed_array(l2_to_l1_msgs, |msg| msg.expose_to_public().is_empty());

    // The check for "denseness" (non-emptiness) of both private and contract class logs is different from the check for
    // emptiness, for efficiency reasons. Here, we perform separate checks: one for denseness, and one for trimmed
    // emptiness.
    // The tx base rollups add logs to the blob data by referencing their `.length`. Therefore, we only need to ensure
    // that logs within the claimed length have non-zero length. It does not matter if all of the fields in those
    // non-zero-length logs are zero (although that's not possible for private logs, because the reset circuit silos the
    // first field).
    // For logs beyond the claimed length, not only must they each have length 0, they also must be empty. Even though
    // the tx base rollups will not add logs with length 0 to the blob data, extra non-empty fields would be stored or
    // broadcasted on the sequencer/prover side. This would have been extra work that was not compensated, as we do not
    // charge for logs with zero length.
    assert_dense_array(private_logs, |log| log.innermost().log.length != 0);
    // We only check whether the *innermost* private log is empty, since the contract address and counter are not
    // exposed to the public.
    assert_trimmed_array(private_logs, |log| log.innermost().log.is_empty());

    assert_dense_array(
        contract_class_logs_hashes,
        |log_hash| log_hash.innermost().length != 0,
    );
    // We require the entire contract class log hash to be empty because the contract address is exposed to the public.
    assert_trimmed_array(contract_class_logs_hashes, |log_hash| log_hash.is_empty());

    // A public call request is checked on `inner`, the `PublicCallRequest` without its counter: that is the form the
    // sorted-transform helper compares, and the form the AVM consumes and counts (the public tx base rollup derives the
    // request count with `array_length`, i.e. from `PublicCallRequest::is_empty()`). Within the claimed length a
    // request must therefore be non-empty, and beyond it entirely empty.
    // Denseness is asserted here rather than inferred from `validate_msg_senders` in `private_call_data_validator.nr`:
    // that check pins an enqueued request's `msg_sender` to the caller's contract address or
    // `NULL_MSG_SENDER_CONTRACT_ADDRESS`, but the caller's contract address is not itself constrained to be non-zero.
    if is_for_public {
        assert_dense_trimmed_array(
            public_call_requests,
            |call_request| call_request.inner.is_empty(),
        );
    } else {
        assert(
            public_call_requests.length == 0,
            "Public call stack must be empty when executing the tail circuit",
        );
    }
}
