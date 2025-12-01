use types::{
    abis::{
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::{SideEffectCounterRange, SideEffectUniquenessHints},
    },
    constants::{
        GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
        GLOBAL_INDEX_NOTE_HASH_OFFSET, GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        GLOBAL_INDEX_NULLIFIER_OFFSET, GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET, GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET, TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
    },
    side_effect::Ordered,
    utils::arrays::ClaimedLengthArray,
};

// This function ensures that side effect counters of a private call are unique and within bounds of the private call.
// For nested calls, the uniqueness check also ensures that no other side effect falls within the range of the nested call counters.
// In order to do that, we map each side effect in the public inputs to a range of counters. For regular side effects, start and end are the same,
// for nested calls, start and end are different.
// After constraining the mapping to the list of ranges, we validate that call_start_counter < ranges[0].start ... < call_end_counter.
// Tested in tests/private_call_data_validator_builder/validate_side_effect_counters.nr
pub fn validate_unique_and_within_bounds_side_effect_counters(
    public_inputs: PrivateCircuitPublicInputs,
    side_effect_sorting_hints: SideEffectUniquenessHints,
) {
    // In order to constrain the mapping to the list of ranges, we are going to require that each side effect is mapped to a range, and that one range
    // is mapped to one side effect. In order to address side effects, we introduce the concept of global indices, which allow us to uniquely identify a slot
    // in the set of all possible side effects.
    let side_effect_ranges = side_effect_sorting_hints.side_effect_ranges;

    // The number of active items in the ranges list.
    let total_side_effects = public_inputs.note_hash_read_requests.length
        + public_inputs.nullifier_read_requests.length
        + public_inputs.note_hashes.length
        + public_inputs.nullifiers.length
        + public_inputs.private_call_requests.length
        + public_inputs.public_call_requests.length
        + public_inputs.l2_to_l1_msgs.length
        + public_inputs.private_logs.length
        + public_inputs.contract_class_logs_hashes.length;

    // If the global index offsets constants were incorrectly calculated, this would be very bad. There is a test in constants.nr to check that they are properly computed.
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.note_hash_read_requests,
        side_effect_sorting_hints.note_hash_read_request_indices,
        side_effect_ranges,
        GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.nullifier_read_requests,
        side_effect_sorting_hints.nullifier_read_request_indices,
        side_effect_ranges,
        GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.note_hashes,
        side_effect_sorting_hints.note_hashes_indices,
        side_effect_ranges,
        GLOBAL_INDEX_NOTE_HASH_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.nullifiers,
        side_effect_sorting_hints.nullifiers_indices,
        side_effect_ranges,
        GLOBAL_INDEX_NULLIFIER_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_call_request(
        public_inputs.private_call_requests,
        side_effect_sorting_hints.private_call_requests_indices,
        side_effect_ranges,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.public_call_requests,
        side_effect_sorting_hints.public_call_requests_indices,
        side_effect_ranges,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.l2_to_l1_msgs,
        side_effect_sorting_hints.l2_to_l1_msgs_indices,
        side_effect_ranges,
        GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.private_logs,
        side_effect_sorting_hints.private_logs_indices,
        side_effect_ranges,
        GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        total_side_effects,
    );
    validate_side_effect_ranges_for_counted_side_effects(
        public_inputs.contract_class_logs_hashes,
        side_effect_sorting_hints.contract_class_logs_hashes_indices,
        side_effect_ranges,
        GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        total_side_effects,
    );

    let counter_start = public_inputs.start_side_effect_counter;
    let counter_end = public_inputs.end_side_effect_counter;

    assert(counter_start < counter_end, "private call has incorrect counter range");

    validate_increasing_ranges(
        side_effect_ranges,
        total_side_effects,
        counter_start,
        counter_end,
    );
}

fn validate_side_effect_ranges_for_counted_side_effects<T, let N: u32>(
    items: ClaimedLengthArray<T, N>,
    indices: [u32; N],
    side_effect_ranges: [SideEffectCounterRange; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    global_index_offset: u32,
    total_side_effects: u32,
)
where
    T: Ordered,
{
    let mut should_check = true;
    for i in 0..N {
        let global_index = global_index_offset + i;
        let index = indices[i];
        let range = side_effect_ranges[index];
        let counter = items.array[i].counter();

        should_check &= i != items.length;

        if should_check {
            // Validate index
            assert(index < total_side_effects, "side effect range index out of bounds");
            // Validate that counter == range item
            assert_eq(counter, range.start, "counter does not match start range item");
            assert_eq(counter, range.end, "counter does not match end range item");
            // The range points to this exact side effect. This avoids pointing two side effects to the same range, which would lead to incorrect validation.
            assert_eq(
                global_index,
                range.side_effect_global_index,
                "range global index does not match side effect global index",
            );
        }
    }
}

fn validate_side_effect_ranges_for_call_request<let N: u32>(
    private_call_requests: ClaimedLengthArray<PrivateCallRequest, N>,
    indices: [u32; N],
    side_effect_ranges: [SideEffectCounterRange; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    global_index_offset: u32,
    total_side_effects: u32,
) {
    let mut should_check = true;
    for i in 0..N {
        let global_index = global_index_offset + i;
        let index = indices[i];
        let range = side_effect_ranges[index];
        let item = private_call_requests.array[i];
        let start_counter = item.start_side_effect_counter;
        let end_counter = item.end_side_effect_counter;

        should_check &= i != private_call_requests.length;

        if should_check {
            // Validate index
            assert(index < total_side_effects, "side effect range index out of bounds");

            // Validate that (start_counter, end_counter) == range item
            assert_eq(start_counter, range.start, "start counter does not match range item");
            assert_eq(end_counter, range.end, "end counter does not match range item");
            // For ranges that come from counted side effects, range.start == range.end.
            // However, for ranges that come from nested calls, we need to ensure that start_counter < end_counter.
            // Without this check, we would allow the ranges which should be monotonically increasing, to decrease.
            assert(start_counter < end_counter, "nested call has incorrect counter range");

            // The range points to this exact side effect. This avoids pointing two side effects to the same range, which would lead to incorrect validation.
            assert_eq(
                global_index,
                range.side_effect_global_index,
                "range global index does not match side effect global index",
            );
        }
    }
}

// Validates that the active ranges are monotonically increasing.
fn validate_increasing_ranges(
    side_effect_ranges: [SideEffectCounterRange; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    total_side_effects: u32,
    counter_start: u32,
    counter_end: u32,
) {
    let mut prev_counter = counter_start;
    let mut should_check = true;
    for i in 0..TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL {
        let range = side_effect_ranges[i];
        should_check &= i != total_side_effects;

        if should_check {
            assert(
                range.start > prev_counter,
                "start counter must be greater than previous counter",
            );
            // We don't need to check here that range.end > range.start, because active ranges can only come from two sources:
            // 1. Counted side effects, where range.start == range.end.
            // 2. Nested calls, where we validated above that range.start < range.end.
            prev_counter = range.end;
        }
    }
    assert(prev_counter < counter_end, "end counter must be less than the end counter of the call");
}
