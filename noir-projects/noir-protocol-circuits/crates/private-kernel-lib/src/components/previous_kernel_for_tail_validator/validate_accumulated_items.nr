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

    // L2 to L1 messages within the claimed length are guaranteed to have non empty contract address, which will be exposed to public.
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

    // For `public_call_requests`, we only need to ensure that the trimmed items are nullish (i.e.
    // we don't need to ensure denseness here). Items emitted from private functions are _guaranteed_
    // to be non-empty because their `msg_sender` is either the caller's contract address (which
    // cannot be 0) or `NULL_MSG_SENDER_CONTRACT_ADDRESS`.
    // See `private_call_data_validator.nr > validate_public_call_request` for details.
    if is_for_public {
        assert_trimmed_array(
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
