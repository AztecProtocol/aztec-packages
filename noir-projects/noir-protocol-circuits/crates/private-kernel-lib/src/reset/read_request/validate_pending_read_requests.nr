use dep::types::{
    abis::{read_request::ScopedReadRequest, side_effect::{Ordered, Readable}},
    utils::arrays::ClaimedLengthArray,
};

pub struct PendingReadHint {
    pub read_request_index: u32,
    pub pending_value_index: u32,
}

impl PendingReadHint {
    pub fn skip(read_request_len: u32) -> Self {
        PendingReadHint { read_request_index: read_request_len, pending_value_index: 0 }
    }
}

// Validates that "pending" read requests (reads of values emitted earlier in the same transaction) are valid.
//
// Context:
// - Pending values are those produced within the current transaction. This array contains values that may be emitted
//   before or after the read requests were made.
// - Each `PendingReadHint` provides indices to link a read request with its corresponding pending value.
// - Unused hints must be marked with `read_request_index == ReadRequestLen`.
//
// Invariants checked:
// 1. If a hint is active (its `read_request_index` is not `ReadRequestLen`):
//    - The `pending_value_index` must be within the claimed length.
//    - The pending value must match the corresponding read request.
//    - The pending value must be emitted before the read request (i.e., the pending value's counter is less than the
//      read request's counter).
// 2. If a hint is inactive (its `read_request_index == ReadRequestLen`):
//    - It is ignored (no validation performed).
//
// More info here:
// - https://discourse.aztec.network/t/to-read-or-not-to-read/178
// - https://discourse.aztec.network/t/spending-notes-which-havent-yet-been-inserted/180
pub fn validate_pending_read_requests<let ReadRequestLen: u32, Value, let PendingValueLen: u32, let PendingReadHintsLen: u32>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, ReadRequestLen>,
    pending_values: ClaimedLengthArray<Value, PendingValueLen>,
    hints: [PendingReadHint; PendingReadHintsLen],
)
where
    Value: Readable<ScopedReadRequest> + Ordered,
{
    for hint in hints {
        let read_request_index = hint.read_request_index;
        let pending_value_index = hint.pending_value_index;
        if read_request_index != ReadRequestLen {
            assert(
                pending_value_index < pending_values.length,
                "Cannot read a pending value beyond claimed length",
            );

            let read_request = read_requests.array[read_request_index];
            let pending_value = pending_values.array[hint.pending_value_index];
            pending_value.assert_match_read_request(read_request);

            assert(
                pending_value.counter() < read_request.counter(),
                "Pending value must be emitted before the read request",
            );
        }
    }
}
