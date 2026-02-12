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

    // Q: trimmed check only verifies .value, not .note_hash -- is that ok?
    assert_dense_trimmed_array(
        nullifiers,
        |nullifier| nullifier.innermost().value.is_empty(),
    );

    // L2 to L1 messages within the claimed length are guaranteed to have non empty contract address, which will be exposed to public.

    // Bug 1: l2_to_l1_msgs - missing dense check                                                             
                                                                                   
    //   Line 34 has assert_trimmed_array but no assert_dense_array. The comment on line 33 claims density is
    //   "guaranteed to have non empty contract address." But:

    //   - EthAddress.validate() (eth_address.nr:34-36) only checks bit size, NOT that the address is non-zero.
    //   So the recipient validation on line 127 of the parent file doesn't serve as a density check.
    //   - Without a dense check, a slot within .length could contain an empty L2ToL1Message (zero recipient,
    //   zero content).
    //   - assert_sorted_transformed_array prevents multiple empty items within .length (because empty items
    //   have counter=0, violating strictly-increasing counters), but a single empty item at position 0 (when
    //   length == 1) would pass all checks.
    //   - An empty L2-to-L1 message would propagate to the output via expose_to_public() and reach the
    //   rollup/L1.

    //   Severity: Low-to-medium. The practical impact depends on whether an empty L2-to-L1 message causes
    //   issues on L1, and whether the init/inner circuits actually prevent this. But the tail should not rely
    //   on upstream guarantees when it's the last line of defense.
    assert_trimmed_array(l2_to_l1_msgs, |msg| msg.expose_to_public().is_empty());

    assert_dense_array(private_logs, |log| log.innermost().log.length != 0);
    assert_trimmed_array(private_logs, |log| log.innermost().log.is_empty());

    //   Bug 3: contract_class_logs_hashes - trimmed check misses contract_address

    //   Line 46: |log_hash| log_hash.innermost().is_empty() checks LogHash { value: 0, length: 0 } but does NOT
    //    check contract_address.

    //   This matters because expose_to_public() for Scoped<Counted<LogHash>> returns Scoped<LogHash> -
    //   preserving contract_address (log_hash.nr:31-33). A trimmed slot with LogHash::empty() but
    //   contract_address != 0 produces a non-empty Scoped<LogHash> in the output.

    //   The tail output validator's assert_sorted_transformed_array (line 110-116) forces the output at that
    //   position to match expose_to_public() of the input. So the non-empty Scoped<LogHash> propagates to the
    //   final PrivateToRollupAccumulatedData.

    //   Severity: Medium. Non-empty items beyond the valid length in the rollup output. Could confuse
    //   downstream consumers or hash computations. Compare with l2_to_l1_msgs whose trimmed check uses
    //   msg.expose_to_public().is_empty(), which correctly covers contract_address.
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
