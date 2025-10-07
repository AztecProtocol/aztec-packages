use super::{read_request_action::ReadRequestActions, read_request_hints::ReadRequestHints};
use dep::types::{abis::read_request::ScopedReadRequest, utils::arrays::ClaimedLengthArray};

pub fn validate_propagated_read_requests<let ReadRequestLen: u32, let PendingReadHintsLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, ReadRequestLen>,
    propagated_read_requests: ClaimedLengthArray<ScopedReadRequest, ReadRequestLen>,
    hints: ReadRequestHints<ReadRequestLen, PendingReadHintsLen, SettledReadHintsLen, TreeHeight, SettledReadLeafPreimage>,
) {
    let mut num_propagated = 0;
    for i in 0..ReadRequestLen {
        let read_request = read_requests.array[i];
        let status = hints.read_request_actions[i];
        if status.action == ReadRequestActions.READ_AS_PENDING {
            // Ensure the pending hint correctly refers to this read request.
            // The hint would've been used in `validate_pending_read_requests` to validate this read request.
            assert_eq(
                hints.pending_read_hints[status.hint_index].read_request_index,
                i,
                "Hinted pending read request does not match status",
            );
        } else if status.action == ReadRequestActions.READ_AS_SETTLED {
            // Ensure the settled hint correctly refers to this read request.
            // The hint would've been used in `validate_settled_read_requests` to validate this read request.
            assert_eq(
                hints.settled_read_hints[status.hint_index].read_request_index,
                i,
                "Hinted settled read request does not match status",
            );
        } else {
            // This read request is being propagated.

            // No need to check that there are no pending or settled hints pointing to this read request.
            // If the action is incorrectly set, we may propagate a read request that's already been validated.
            // This isn't a security issue, but it's inefficient, since the prover would need to run a reset circuit
            // again to clear all read requests before executing the private tail.

            assert_eq(
                propagated_read_requests.array[num_propagated],
                read_request,
                "Mismatch propagated read request",
            );

            if i < read_requests.length {
                // Only count the propagated read request if it's within the claimed length.
                // Without this check, we'd be counting all un-validated read requests, even empty ones, and incorrectly
                // include them in the final claimed length.
                //
                // Note: it's cheaper not to include the above `assert_eq` inside this if statement.
                // But if any two read requests beyond the claimed length differ, the assertion will fail,
                // because num_propagated will no longer be incremented and both will refer to the same index
                // in propagated_read_requests.
                // This doesn't allow the extra read requests to override the valid read requests being propagated.
                num_propagated += 1;
            }
        }
    }

    assert_eq(
        propagated_read_requests.length,
        num_propagated,
        "Incorrect propagated read requests length",
    );
}
