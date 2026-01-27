use dep::types::{
    side_effect::{Counted, Ordered, Readable, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct PendingReadHint {
    pub read_request_index: u32,
    pub pending_value_index: u32,
}

impl PendingReadHint {
    pub fn skip(read_request_len: u32) -> Self {
        PendingReadHint { read_request_index: read_request_len, pending_value_index: 0 } // TODO: seems dangerous to default to this meaningful index of `0`, instead of the length of the pending_value_index or MAX_U32.
        // TODO: could we also use MAX_U32 for a skipped read_request_index too, instead of passing-in and using read_request_len (it would avoid having to thread the value through functions)?
    }
}

/// Validates that "pending" read requests (reads of values emitted earlier in the same transaction) are valid.
///
/// Context:
/// - Pending values are those produced within the current transaction. This array contains values that may be emitted
///   before or after the read requests were made.
/// - Each `PendingReadHint` provides indices to link a read request with its corresponding pending value.
/// - Unused hints must be marked with `read_request_index == ReadRequestLen`. // TODO: consider using MAX_U32_VALUE
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
pub fn validate_pending_read_requests<let ReadRequestLen: u32, Value, let PendingValueLen: u32, let PendingReadHintsLen: u32>(
    read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    pending_values: ClaimedLengthArray<Scoped<Counted<Value>>, PendingValueLen>,
    hints: [PendingReadHint; PendingReadHintsLen],
)
where
    Value: Readable,
{
    for hint in hints {
        let read_request_index = hint.read_request_index;
        let pending_value_index = hint.pending_value_index;
        // Consider using MAX_U32 for null items.
        // So the `pending_read_hints` array isn't constrained to be dense on the lhs, empty on the rhs.
        // You could have [hint, null, hint, null, hint, null] and that is acceptable? Is that safe?
        //
        // WAIT - possible bug to think about:
        // If a PENDING item of `read_request_actions` points to an entry of `pending_read_hints`, but that 
        // entry's `read_request_index` is maliciously set to null (currently ReadRequestLen, but my brain would
        // prefer MAX_U32), then this `if` block will be skipped. This would allow me to make fake read_requests that
        // don't match up to any of the pending note_hashes/nullifiers. So I could read anything I like
        // within my app circuit (like a note that contains infinite value).
        // NOPE - there's a check in validate_propagated_read_requests which ensures the `read_request_index` matches
        // the index of a read_request_action that points to it. DAMMIT, no bug for me today.
        // TODO: describe this attack in more detail, and explain how constraints elsewhere prevent it.
        if read_request_index != ReadRequestLen {
            // Oh no! Range checks! Sad face!
            // So by not asserting that the rhs of our arrays are empty (in the assert_array_appended logic of
            // the init/inner kernel circuits), we now have to protect against them being nonempty?
            // Has that init/inner optimisation caused more constraints overall, or not?
            // I guess because the pending_read_hints array is generally smaller than the larger arrays 
            // (by design), we probably are saving constraints with the current approach?
            // I wonder if `<` has more constraints than a subtraction (that would underflow and fail)?
            // E.g. we could do assert(pending_values.length - pending_value_index != 0); maybe?
            // Often `<` is just a subtraction in disguise in arithmetic algorithms.
            assert(
                pending_value_index < pending_values.length,
                "Cannot read a pending value beyond claimed length",
            );

            let read_request = read_requests.array[read_request_index];
            let pending_value = pending_values.array[hint.pending_value_index];

            // Validate that the pending value matches the read request.
            pending_value.innermost().assert_match_read_request(read_request.innermost());

            // Validate that the pending value has the same contract address as the read request.
            assert_eq(
                pending_value.contract_address,
                read_request.contract_address,
                "Contract address of the pending value does not match read request",
            );

            // Validate that the pending value was emitted before the read request.
            assert(
                pending_value.counter() < read_request.counter(),
                "Pending value must be emitted before the read request",
            );
        } // Belt and braces:
        else {
            // Adds 8 gates.
            assert_eq(pending_value_index, MAX_U32_VALUE);
        }
    }
}
