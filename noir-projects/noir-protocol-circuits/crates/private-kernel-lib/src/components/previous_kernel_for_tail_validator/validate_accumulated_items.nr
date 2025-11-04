use crate::accumulated_data::{assert_dense_trimmed_array, assert_trimmed_array};
use types::{abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, traits::Empty};

/// Validate that the arrays in the accumulated data are dense trimmed:
/// - Items within `original_array.length` are not nullish.
/// - Items beyond `original_array.length` are nullish.
///
/// "Nullish" here does not necessarily mean the item is entirely empty; rather, one or more of its fields are empty.
/// This makes the validation cheaper and ensures that even if these partially empty items are exposed to the AVM or
/// rollup circuits, they will not be used or included in the blob data.
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
    // nullish. These are the final siloed values that are exposed to the AVM and rollup circuits
    assert_dense_trimmed_array(note_hashes, |note_hash| note_hash.innermost().is_empty());
    assert_dense_trimmed_array(
        nullifiers,
        |nullifier| nullifier.innermost().value.is_empty(),
    );

    // For `l2_to_l1_msgs`, only the recipient address needs to be checked to determine nullish-ness. Although the
    // `out_hash` will remain non-zero if other fields are not empty, such a hash can only be consumed on L1 by the
    // contract at the zero address, making it effectively useless.
    // Note: If the recipient address is non-zero, the `out_hash` will also be non-zero. Therefore, allowing non-zero
    // `out_hash` values in the trimmed part of the array does not allow the tx base rollup to skip (via `array_length`)
    // including these messages in the dense portion, since all of them would be non-zero.
    // See `private_tx_effect_builder.nr` and `public_tx_effect_builder.nr` for details.
    assert_dense_trimmed_array(l2_to_l1_msgs, |msg| msg.innermost().recipient.is_empty());

    // For `private_logs` and `contract_class_logs_hashes`, we check the length to determine nullish-ness. The tx base
    // rollup uses these lengths to decide how many log fields are included in the blob data.
    assert_dense_trimmed_array(private_logs, |log| log.innermost().log.length == 0);
    assert_dense_trimmed_array(
        contract_class_logs_hashes,
        |log_hash| log_hash.innermost().length == 0,
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
            public_call_requests.array[0].inner.msg_sender.is_zero(),
            "Public call stack must be empty when executing the tail circuit",
        );
    }

    // TODO: Consider checking the contract address to determine whether a call request is nullish.
    // i.e., the AVM will skip processing a call request if the contract address is zero but other fields are not.
    // It may be useful to also check the contract address for the "dense" items here.
}
