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

    assert_dense_array(private_logs, |log| log.innermost().log.length != 0);
    assert_trimmed_array(private_logs, |log| log.innermost().log.is_empty());

    assert_dense_array(
        contract_class_logs_hashes,
        |log_hash| log_hash.innermost().length != 0,
    );
    assert_trimmed_array(
        contract_class_logs_hashes,
        |log_hash| log_hash.innermost().is_empty(),
    );

    // For `public_call_requests`, we only need to ensure that the trimmed items are nullish. Items emitted from private
    // functions are guaranteed to be non-empty - their `msg_sender` is either the caller's contract address (which
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
