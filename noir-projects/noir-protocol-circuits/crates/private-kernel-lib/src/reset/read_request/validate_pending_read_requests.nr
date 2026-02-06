use dep::types::{
    side_effect::{Counted, Ordered, Readable, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct PendingReadHint {
    pub read_request_index: u32, // "The note/nullifier read_request at index 3..."
    pub pending_value_index: u32, // "... must match the previous_kernel's pending note/nullifier at index 7"
}

impl PendingReadHint {
    pub fn skip(read_request_len: u32) -> Self {
        PendingReadHint { read_request_index: read_request_len, pending_value_index: 0 }
    }
}

/// Validates that "pending" read requests (reads of values emitted earlier in the same transaction) are valid.
///
/// Context:
/// - Pending values are those produced within the current transaction. This array contains values that may be emitted
///   before or after the read requests were made.
/// - Each `PendingReadHint` provides indices to link a read request with its corresponding pending value.
/// - Unused hints must be marked with `read_request_index == ReadRequestLen`.
///
/// Invariants checked:
/// 1. If a hint is active (its `read_request_index` is NOT `ReadRequestLen`):
///    - The `pending_value_index` must be within the claimed length.
///    - The pending value must match the corresponding read request.
///    - The pending value must be emitted before the read request (i.e., the pending value's counter is less than the
///      read request's counter).
/// 2. If a hint is inactive (its `read_request_index` is `ReadRequestLen`):
///    - It is ignored (no validation performed).
///
/// More info here:
/// - https://discourse.aztec.network/t/to-read-or-not-to-read/178
/// - https://discourse.aztec.network/t/spending-notes-which-havent-yet-been-inserted/180
pub fn validate_pending_read_requests<let ReadRequestLen: u32, VALUE, let PendingValueLen: u32, let PendingReadHintsLen: u32>(
    read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    pending_values: ClaimedLengthArray<Scoped<Counted<VALUE>>, PendingValueLen>, // previous_kernel.end.[note_hashes|nullifiers]
    pending_read_hints: [PendingReadHint; PendingReadHintsLen],
)
where
    VALUE: Readable,
{
    for hint in pending_read_hints {
        let read_request_index = hint.read_request_index;
        let pending_value_index = hint.pending_value_index;
        if read_request_index != ReadRequestLen {
            assert(
                pending_value_index < pending_values.length,
                "Cannot read a pending value beyond claimed length",
            );

            let read_request = read_requests.array[read_request_index];
            let pending_value = pending_values.array[pending_value_index];

            // Validate that the pending value matches the read request.
            // For the relevant, concrete implementations of `assert_match_read_request`, search for:
            // - `impl Readable for NoteHash` and
            // - `impl Readable for Nullifier`
            pending_value.innermost().assert_match_read_request(read_request.innermost());

            // Validate that the pending value has the same contract address as the read request.
            assert_eq(
                pending_value.contract_address,
                read_request.contract_address,
                "Contract address of the pending value does not match read request",
            );

            // Validate that the pending value was emitted before the read request.
            // (A function must not be able to read a note/nullifier before it has been created, because
            // that violates the order of execution!)
            assert(
                pending_value.counter() < read_request.counter(),
                "Pending value must be emitted before the read request",
            );
        }
    }
}
