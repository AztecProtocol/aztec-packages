use types::{
    abis::{
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
    },
    constants::{
        GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET,
        GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET, GLOBAL_INDEX_NOTE_HASH_OFFSET,
        GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET, GLOBAL_INDEX_NULLIFIER_OFFSET,
        GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET, GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET, GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET, MAX_CONTRACT_CLASS_LOGS_PER_CALL,
        MAX_ENQUEUED_CALLS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL, MAX_U32_VALUE,
        TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
    },
    side_effect::Ordered,
    utils::arrays::{ClaimedLengthArray, subarray},
};

/// Represents a side effect's counter paired with its global index for validation.
/// Used in sorted arrays to verify uniqueness and ordering of counters.
#[derive(Eq)]
pub struct SideEffectCounter {
    /// The counter value assigned to this side effect.
    pub counter: u32,
    /// A unique identifier for this side effect across all arrays.
    /// Computed as: array_type_offset + position_in_array.
    /// See GLOBAL_INDEX_* constants in constants.nr.
    pub global_index: u32,
}

impl SideEffectCounter {
    pub fn new(counter: u32, global_index: u32) -> Self {
        Self { counter, global_index }
    }

    /// Creates a "null" SideEffectCounter used as padding in the sorted array.
    /// Uses MAX_U32_VALUE for global_index since no real side effect can have this index, ensuring null entries cannot
    /// be incorrectly matched to actual side effects.
    pub fn null() -> Self {
        Self { counter: 0, global_index: MAX_U32_VALUE }
    }

    pub fn is_null(self) -> bool {
        self.global_index == MAX_U32_VALUE
    }
}

/// Hints provided by the prover to efficiently validate side effect counter uniqueness.
///
/// The validation establishes a one-to-one mapping between side effects and positions in a sorted array.
/// This struct contains:
/// - `sorted_side_effect_counters`: All counters sorted in ascending order.
/// - `*_indices`: For each side effect type, the position in the sorted array where that side effect's counter appears.
///
/// The circuit validates that each side effect maps to exactly one sorted position, and that position maps back to that
/// side effect (via the global index).
pub struct SideEffectUniquenessHints {
    /// All side effect counters sorted by counter value, with null padding at the end.
    pub sorted_side_effect_counters: [SideEffectCounter; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],

    // For each array below: indices[i] gives the position in sorted_side_effect_counters
    // where array[i]'s counter appears.
    pub note_hash_read_request_indices: [u32; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    pub nullifier_read_request_indices: [u32; MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
    pub note_hashes_indices: [u32; MAX_NOTE_HASHES_PER_CALL],
    pub nullifiers_indices: [u32; MAX_NULLIFIERS_PER_CALL],
    /// For private calls, the index points to the start counter; end counter is at index+1.
    pub private_call_requests_indices: [u32; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
    pub public_call_requests_indices: [u32; MAX_ENQUEUED_CALLS_PER_CALL],
    pub l2_to_l1_msgs_indices: [u32; MAX_L2_TO_L1_MSGS_PER_CALL],
    pub private_logs_indices: [u32; MAX_PRIVATE_LOGS_PER_CALL],
    pub contract_class_logs_hashes_indices: [u32; MAX_CONTRACT_CLASS_LOGS_PER_CALL],
    pub min_revertible_side_effect_counter_index: u32,
}

/// # Side Effect Counter Validation
///
/// Ensures all side effect counters within a private function call are unique and within bounds.
///
/// ## Why This Matters
///
/// Side effect counters establish ordering within a transaction. Each side effect (note hash, log, nested call, etc.)
/// gets a counter when created. These counters must be:
///
/// 1. **Unique** - No two side effects can share a counter value
/// 2. **Within bounds** - All counters must satisfy: private_call_start_counter < counter < private_call_end_counter
/// 3. **Non-overlapping with nested calls** - A nested call "reserves" a range of counters; no other side effect in the
///    parent call can use counters within that range.
///
/// ## The Global Index System
///
/// To validate uniqueness across multiple arrays (note_hashes, private_logs, private_call_requests, etc.), each side
/// effect slot gets a unique "global index":
///
///   global_index = GLOBAL_INDEX_<TYPE>_OFFSET + position_in_array
///
/// For example, if GLOBAL_INDEX_NOTE_HASH_OFFSET is 100, then note_hashes[3] has global_index 103.
/// This allows the sorted array to reference back to the exact side effect it came from.
///
/// ## Validation Algorithm
///
/// 1. **Build sorted array**: Collect all counters into a single array sorted by counter value.
///    Each entry stores (counter, global_index).
/// 2. **Verify one-to-one mapping**: For each side effect, the hints provide its position in the sorted array.
///    We verify:
///    - The counter at that position matches the side effect's counter.
///    - The global_index at that position matches the side effect's global_index.
///    This proves no two side effects map to the same sorted position.
/// 3. **Verify strict ordering**: Walk the sorted array and confirm counters are strictly increasing (no duplicates)
///    and all fall within (private_call_start_counter, private_call_end_counter).
/// 4. **Handle nested calls specially**: Private call requests contribute TWO entries to the sorted array (start and
///    end counters) which must be adjacent. This ensures no other side effect's counter falls within the nested call's
///    "reserved" range.
pub fn validate_unique_and_within_bounds_side_effect_counters(
    public_inputs: PrivateCircuitPublicInputs,
) {
    // Safety: These are hints to validate in the with hints function.
    let side_effect_sorting_hints = unsafe { build_uniqueness_hints(public_inputs) };
    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        public_inputs,
        side_effect_sorting_hints,
    );
}

pub fn validate_unique_and_within_bounds_side_effect_counters_with_hints(
    public_inputs: PrivateCircuitPublicInputs,
    side_effect_sorting_hints: SideEffectUniquenessHints,
) {
    let sorted_side_effect_counters = side_effect_sorting_hints.sorted_side_effect_counters;

    // Count how many entries we expect in the sorted array.
    // Private calls count as 2 (start + end counters); everything else counts as 1.
    let total_side_effects = public_inputs.note_hash_read_requests.length
        + public_inputs.nullifier_read_requests.length
        + public_inputs.note_hashes.length
        + public_inputs.nullifiers.length
        + public_inputs.private_call_requests.length * 2
        + public_inputs.public_call_requests.length
        + public_inputs.l2_to_l1_msgs.length
        + public_inputs.private_logs.length
        + public_inputs.contract_class_logs_hashes.length
        + if public_inputs.min_revertible_side_effect_counter == 0 {
            0
        } else {
            1
        };

    // Verify padding: all entries beyond total_side_effects must be null.
    // This prevents a malicious prover from adding extra entries that could allow duplicate or unsorted counters.
    let mut should_be_tailing = false;
    for i in 0..sorted_side_effect_counters.len() {
        should_be_tailing |= i == total_side_effects;
        if should_be_tailing {
            assert_eq(
                sorted_side_effect_counters[i].global_index,
                MAX_U32_VALUE,
                "Sorted counter hints must have null trailing values",
            );
        }
    }

    // Validate the one-to-one mapping for each side effect type.
    // Each call verifies that side effects map to correct positions in the sorted array.
    validate_side_effect_counters_for_array(
        public_inputs.note_hash_read_requests,
        side_effect_sorting_hints.note_hash_read_request_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.nullifier_read_requests,
        side_effect_sorting_hints.nullifier_read_request_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.note_hashes,
        side_effect_sorting_hints.note_hashes_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_NOTE_HASH_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.nullifiers,
        side_effect_sorting_hints.nullifiers_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_NULLIFIER_OFFSET,
    );
    validate_side_effect_ranges_for_call_request(
        public_inputs.private_call_requests,
        side_effect_sorting_hints.private_call_requests_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET,
        GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.public_call_requests,
        side_effect_sorting_hints.public_call_requests_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.l2_to_l1_msgs,
        side_effect_sorting_hints.l2_to_l1_msgs_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.private_logs,
        side_effect_sorting_hints.private_logs_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
    );
    validate_side_effect_counters_for_array(
        public_inputs.contract_class_logs_hashes,
        side_effect_sorting_hints.contract_class_logs_hashes_indices,
        sorted_side_effect_counters,
        GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
    );

    validate_side_effect_counter_for_single_value(
        public_inputs.min_revertible_side_effect_counter,
        side_effect_sorting_hints.min_revertible_side_effect_counter_index,
        sorted_side_effect_counters,
        GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET,
    );

    let counter_start = public_inputs.start_side_effect_counter;
    let counter_end = public_inputs.end_side_effect_counter;

    // This condition should also be validated in validate_increasing_counters. But testing it explicitly to have a more
    // specific error message.
    assert(counter_start < counter_end, "Private call has incorrect counter range");

    validate_increasing_counters(
        sorted_side_effect_counters,
        total_side_effects,
        counter_start,
        counter_end,
    );
}

/// Validates that each side effect in an array maps to exactly one position in the sorted array, and that position maps
/// back to this side effect (establishing a one-to-one correspondence).
fn validate_side_effect_counters_for_array<T, let N: u32>(
    items: ClaimedLengthArray<T, N>,
    indices: [u32; N],
    sorted_side_effect_counters: [SideEffectCounter; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    global_index_offset: u32,
)
where
    T: Ordered,
{
    let mut should_check = true;
    for i in 0..N {
        let counter = items.array[i].counter();
        let global_index = global_index_offset + i;
        should_check &= i != items.length;

        // Look up where this side effect should appear in the sorted array.
        let index = indices[i];
        let hint = sorted_side_effect_counters[index];

        if should_check {
            // Verify counter matches (side effect -> sorted position).
            assert_eq(counter, hint.counter, "Mismatch counter: side effect does not match hint");
            // Verify global_index matches (sorted position -> side effect).
            // This bidirectional check ensures the mapping is one-to-one.
            assert_eq(
                global_index,
                hint.global_index,
                "Mismatch global index: side effect does not match hint",
            );
        }
    }
}

/// Validates a single counter value (e.g., min_revertible_side_effect_counter).
/// Only validates if counter is non-zero (0 means not set).
fn validate_side_effect_counter_for_single_value(
    counter: u32,
    index: u32,
    sorted_side_effect_counters: [SideEffectCounter; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    global_index_offset: u32,
) {
    let global_index = global_index_offset;
    let hint = sorted_side_effect_counters[index];

    if counter != 0 {
        assert_eq(counter, hint.counter, "Mismatch counter: value does not match hint");
        assert_eq(
            global_index,
            hint.global_index,
            "Mismatch global index: value does not match hint",
        );
    }
}

/// Validates counter ranges for nested private calls.
///
/// Unlike regular side effects which have a single counter, nested private calls reserve a range
/// [start_counter, end_counter]. To prevent any other side effect from using a counter within this range, we require
/// the start and end counters to occupy ADJACENT positions in the sorted array.
///
/// Example: If a nested call has start=10, end=20, the sorted array might look like:
///   [..., (counter=9, ...), (counter=10, start_idx), (counter=20, end_idx), (counter=21, ...), ...]
/// The adjacency ensures no counter value 11-19 can exist.
fn validate_side_effect_ranges_for_call_request<let N: u32>(
    private_call_requests: ClaimedLengthArray<PrivateCallRequest, N>,
    indices: [u32; N],
    sorted_side_effect_counters: [SideEffectCounter; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    global_index_offset_for_range_start: u32,
    global_index_offset_for_range_end: u32,
) {
    let mut should_check = true;
    for i in 0..N {
        let item = private_call_requests.array[i];
        let start_counter = item.start_side_effect_counter;
        let end_counter = item.end_side_effect_counter;
        let global_index_for_range_start = global_index_offset_for_range_start + i;
        let global_index_for_range_end = global_index_offset_for_range_end + i;
        should_check &= i != private_call_requests.length;

        // The index points to the start counter; end counter must be at index+1 (adjacent).
        let index = indices[i];
        let start_hint = sorted_side_effect_counters[index];
        let end_hint = sorted_side_effect_counters[index + 1];

        if should_check {
            // Verify counters match.
            assert_eq(
                start_counter,
                start_hint.counter,
                "Mismatch counter: start of call request does not match hint",
            );
            assert_eq(
                end_counter,
                end_hint.counter,
                "Mismatch counter: end of call request does not match hint",
            );

            // Verify global indices match (bidirectional check for one-to-one mapping).
            assert_eq(
                global_index_for_range_start,
                start_hint.global_index,
                "Mismatch global index: start of call request does not match hint",
            );
            assert_eq(
                global_index_for_range_end,
                end_hint.global_index,
                "Mismatch global index: end of call request does not match hint",
            );
        }
    }
}

/// Verifies the sorted array has strictly increasing counters within bounds.
///
/// This is the final check that establishes uniqueness: since we've verified the one-to-one mapping between side
/// effects and sorted positions, and now verify the sorted array has no duplicate values (strictly increasing), we
/// know all original counters are unique.
///
/// Also verifies all counters fall within (private_call_counter_start, private_call_counter_end) - exclusive on both
/// ends, meaning counters must be strictly greater than start and strictly less than end.
fn validate_increasing_counters(
    sorted_side_effect_counters: [SideEffectCounter; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
    total_side_effects: u32,
    private_call_counter_start: u32,
    private_call_counter_end: u32,
) {
    let mut prev_counter = private_call_counter_start;
    let mut should_check = true;
    for i in 0..TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL {
        let hint = sorted_side_effect_counters[i];
        should_check &= i != total_side_effects;

        if should_check {
            // Strictly greater than previous ensures no duplicates and > counter_start.
            assert(hint.counter > prev_counter, "Counter must be greater than previous counter");
            prev_counter = hint.counter;
        }
    }
    // The largest counter (prev_counter after loop) must be < counter_end.
    assert(
        prev_counter < private_call_counter_end,
        "Counter must be less than the end counter of the call",
    );
}

/// Creates two SideEffectCounter entries for a nested private call.
/// Returns (start_counter_entry, end_counter_entry) which must be adjacent in sorted array.
fn build_side_effect_counter_hints_for_private_call_request(
    item: PrivateCallRequest,
    index_in_array: u32,
) -> (SideEffectCounter, SideEffectCounter) {
    let start = SideEffectCounter {
        counter: item.start_side_effect_counter,
        global_index: index_in_array + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET,
    };
    let end = SideEffectCounter {
        counter: item.end_side_effect_counter,
        global_index: index_in_array + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_END_OFFSET,
    };
    (start, end)
}

/// Builds hints for side effect counter validation (unconstrained helper for the prover).
///
/// This function:
/// 1. Collects all side effects from all arrays into a single list
/// 2. Sorts them by counter value
/// 3. Builds the reverse mapping (for each side effect, which position in the sorted array)
unconstrained fn build_uniqueness_hints(
    public_inputs: PrivateCircuitPublicInputs,
) -> SideEffectUniquenessHints {
    let mut side_effect_counters = BoundedVec::from_parts_unchecked(
        [SideEffectCounter::null(); TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL],
        0,
    );

    for i in 0..public_inputs.note_hash_read_requests.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.note_hash_read_requests.array[i].counter(),
            i + GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.nullifier_read_requests.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.nullifier_read_requests.array[i].counter(),
            i + GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.note_hashes.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.note_hashes.array[i].counter(),
            i + GLOBAL_INDEX_NOTE_HASH_OFFSET,
        ));
    }

    for i in 0..public_inputs.nullifiers.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.nullifiers.array[i].counter(),
            i + GLOBAL_INDEX_NULLIFIER_OFFSET,
        ));
    }

    for i in 0..public_inputs.private_call_requests.length {
        let (start, end) = build_side_effect_counter_hints_for_private_call_request(
            public_inputs.private_call_requests.array[i],
            i,
        );
        side_effect_counters.push(start);
        side_effect_counters.push(end);
    }

    for i in 0..public_inputs.public_call_requests.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.public_call_requests.array[i].counter(),
            i + GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
        ));
    }

    for i in 0..public_inputs.l2_to_l1_msgs.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.l2_to_l1_msgs.array[i].counter(),
            i + GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
        ));
    }

    for i in 0..public_inputs.private_logs.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.private_logs.array[i].counter(),
            i + GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
        ));
    }

    for i in 0..public_inputs.contract_class_logs_hashes.length {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.contract_class_logs_hashes.array[i].counter(),
            i + GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        ));
    }

    if public_inputs.min_revertible_side_effect_counter != 0 {
        side_effect_counters.push(SideEffectCounter::new(
            public_inputs.min_revertible_side_effect_counter,
            GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET,
        ));
    }

    // Sort by counter value. Null entries (padding) sort to the end.
    let sorted_side_effect_counters = side_effect_counters.storage().sort_via(|a, b| {
        if b.is_null() {
            true
        } else {
            a.counter <= b.counter
        }
    });

    // Build reverse mapping: indices[global_index] = position in sorted array.
    // This allows each side effect to look up its position.
    let mut indices = [0; TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL];
    for i in 0..side_effect_counters.len() {
        let hint = sorted_side_effect_counters[i];
        indices[hint.global_index] = i;
    }

    // Extract per-type index arrays from the global indices array.
    // subarray(indices, offset) extracts the slice starting at offset with the appropriate length.
    SideEffectUniquenessHints {
        sorted_side_effect_counters,
        note_hash_read_request_indices: subarray(
            indices,
            GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
        ),
        nullifier_read_request_indices: subarray(
            indices,
            GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
        ),
        note_hashes_indices: subarray(indices, GLOBAL_INDEX_NOTE_HASH_OFFSET),
        nullifiers_indices: subarray(indices, GLOBAL_INDEX_NULLIFIER_OFFSET),
        private_call_requests_indices: subarray(
            indices,
            GLOBAL_INDEX_PRIVATE_CALL_REQUEST_START_OFFSET,
        ),
        public_call_requests_indices: subarray(indices, GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET),
        l2_to_l1_msgs_indices: subarray(indices, GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET),
        private_logs_indices: subarray(indices, GLOBAL_INDEX_PRIVATE_LOG_OFFSET),
        contract_class_logs_hashes_indices: subarray(
            indices,
            GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
        ),
        min_revertible_side_effect_counter_index: indices[GLOBAL_INDEX_CONTRACT_MIN_REVERTIBLE_SIDE_EFFECT_COUNTER_OFFSET],
    }
}

mod tests {
    use super::{
        build_uniqueness_hints, SideEffectUniquenessHints,
        validate_unique_and_within_bounds_side_effect_counters_with_hints,
    };
    use dep::types::{
        constants::{
            MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL,
            MAX_L2_TO_L1_MSGS_PER_CALL, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
            MAX_NOTE_HASHES_PER_CALL, MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
            MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
            TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
        },
        tests::FixtureBuilder,
    };

    struct TestBuilder {
        private_call: FixtureBuilder,
        hints: SideEffectUniquenessHints,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let mut private_call = FixtureBuilder::new_from_counter(50);

            // Safety: For testing purposes only.
            let hints =
                unsafe { build_uniqueness_hints(private_call.to_private_circuit_public_inputs()) };

            TestBuilder { private_call, hints }
        }

        /// Creates a builder with two nullifiers that have the same counter value.
        /// Used to test that duplicate counters are rejected.
        pub fn new_duplicate_counter() -> Self {
            let mut private_call = FixtureBuilder::new_from_counter(50);
            private_call.append_nullifiers(2);

            // Force both nullifiers to have the same counter.
            let nullifiers = private_call.nullifiers.storage();
            let duplicate_counter = nullifiers[0].inner.counter;
            let mut nullifier_1 = nullifiers[1];
            nullifier_1.inner.counter = duplicate_counter;
            private_call.nullifiers.set(1, nullifier_1);

            // Safety: For testing purposes only.
            let hints =
                unsafe { build_uniqueness_hints(private_call.to_private_circuit_public_inputs()) };

            TestBuilder { private_call, hints }
        }

        pub fn with_nullifiers(&mut self) -> Self {
            self.private_call.append_nullifiers(2);
            self.rebuild_hints();
            *self
        }

        pub fn with_call_requests(&mut self) -> Self {
            self.private_call.append_private_call_requests(2);
            self.rebuild_hints();
            *self
        }

        pub fn with_min_revertible_side_effect_counter(&mut self) -> Self {
            self.private_call.append_nullifiers(1);

            self.private_call.end_setup(); // This sets min_revertible_side_effect_counter.

            self.rebuild_hints();
            *self
        }

        pub fn rebuild_hints(&mut self) {
            // Safety: For testing purposes only.
            self.hints = unsafe {
                build_uniqueness_hints(self.private_call.to_private_circuit_public_inputs())
            };
        }

        pub fn validate(self) {
            let private_call = self.private_call.to_private_circuit_public_inputs();
            validate_unique_and_within_bounds_side_effect_counters_with_hints(
                private_call,
                self.hints,
            );
        }
    }

    #[test]
    fn empty_side_effects() {
        let builder = TestBuilder::new();
        builder.validate();
    }

    #[test]
    fn full_side_effects() {
        let mut builder = TestBuilder::new();

        builder.private_call.append_note_hashes(5);
        builder.private_call.append_nullifiers(7);
        builder.private_call.append_note_hash_read_requests(4);
        builder.private_call.append_nullifier_read_requests(6);
        builder.private_call.append_private_call_requests(4);
        builder.private_call.append_public_call_requests(5);
        builder.private_call.append_l2_to_l1_msgs(3);
        builder.private_call.append_private_logs(4);
        builder.private_call.end_setup();
        // Add remaining side effects after setup to interleave counters across types.
        builder.private_call.append_note_hashes(MAX_NOTE_HASHES_PER_CALL - 5);
        builder.private_call.append_nullifiers(MAX_NULLIFIERS_PER_CALL - 7);
        builder.private_call.append_contract_class_logs(MAX_CONTRACT_CLASS_LOGS_PER_CALL);
        builder.private_call.append_note_hash_read_requests(
            MAX_NOTE_HASH_READ_REQUESTS_PER_CALL - 4,
        );
        builder.private_call.append_nullifier_read_requests(
            MAX_NULLIFIER_READ_REQUESTS_PER_CALL - 6,
        );
        builder.private_call.append_private_call_requests(
            MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL - 4,
        );
        builder.private_call.append_public_call_requests(MAX_ENQUEUED_CALLS_PER_CALL - 5);
        builder.private_call.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_CALL - 3);
        builder.private_call.append_private_logs(MAX_PRIVATE_LOGS_PER_CALL - 4);

        builder.rebuild_hints();

        // Verify all slots are used (no null padding).
        assert(
            !builder.hints.sorted_side_effect_counters[TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL - 1]
                .is_null(),
        );

        builder.validate();
    }

    #[test(should_fail_with = "Counter must be greater than previous counter")]
    fn duplicate_side_effect_counter() {
        let builder = TestBuilder::new_duplicate_counter();
        builder.validate();
    }

    #[test(should_fail_with = "Sorted counter hints must have null trailing values")]
    fn extra_hint_after_bound() {
        let mut builder = TestBuilder::new_duplicate_counter();

        // Try to sneak in an extra hint for the duplicate counter.
        let hint = builder.hints.sorted_side_effect_counters[1];
        builder.hints.sorted_side_effect_counters[2] = hint;
        builder.hints.nullifiers_indices[1] = 2;

        // Make counters incrementing to avoid the duplicate counter check.
        builder.hints.sorted_side_effect_counters[1].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch global index: side effect does not match hint")]
    fn index_points_to_same_hint() {
        let mut builder = TestBuilder::new_duplicate_counter();

        // Point both nullifiers to the same sorted position.
        builder.hints.nullifiers_indices[1] = 0;

        // Make counters incrementing to avoid the duplicate counter check.
        builder.hints.sorted_side_effect_counters[1].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch counter: side effect does not match hint")]
    fn counter_mismatch_in_hint() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Corrupt the counter in the hint.
        builder.hints.sorted_side_effect_counters[0].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Counter must be greater than previous counter")]
    fn counter_equal_to_call_start() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Set the nullifier's counter equal to the private call's start counter.
        let start_counter = builder.private_call.counter_start;
        let mut nullifier = builder.private_call.nullifiers.get(0);
        nullifier.inner.counter = start_counter;
        builder.private_call.nullifiers.set(0, nullifier);

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Counter must be greater than previous counter")]
    fn counter_less_than_call_start() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Set the nullifier's counter to be less than the private call's start counter.
        let start_counter = builder.private_call.counter_start;
        let mut nullifier = builder.private_call.nullifiers.get(0);
        nullifier.inner.counter = start_counter - 1;
        builder.private_call.nullifiers.set(0, nullifier);

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Counter must be less than the end counter of the call")]
    fn counter_equal_to_call_end() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Set the nullifier's counter equal to the private call's end counter.
        let end_counter = builder.private_call.counter;
        let mut nullifier = builder.private_call.nullifiers.get(0);
        nullifier.inner.counter = end_counter;
        builder.private_call.nullifiers.set(0, nullifier);

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Counter must be less than the end counter of the call")]
    fn counter_greater_than_end() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Set the nullifier's counter to be greater than the private call's end counter.
        let end_counter = builder.private_call.counter;
        let mut nullifier = builder.private_call.nullifiers.get(0);
        nullifier.inner.counter = end_counter + 1;
        builder.private_call.nullifiers.set(0, nullifier);

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Counter must be greater than previous counter")]
    fn unsorted_counters_in_hints() {
        let mut builder = TestBuilder::new().with_nullifiers();

        // Swap the order of hints to make them unsorted.
        let hint_0 = builder.hints.sorted_side_effect_counters[0];
        let hint_1 = builder.hints.sorted_side_effect_counters[1];
        builder.hints.sorted_side_effect_counters[0] = hint_1;
        builder.hints.sorted_side_effect_counters[1] = hint_0;
        // Also swap the indices so they point to the swapped hints.
        builder.hints.nullifiers_indices[0] = 1;
        builder.hints.nullifiers_indices[1] = 0;

        builder.validate();
    }

    #[test(should_fail_with = "Private call has incorrect counter range")]
    fn private_call_start_counter_equals_end_counter() {
        let mut builder = TestBuilder::new();

        // Set start equal to end.
        builder.private_call.counter_start = builder.private_call.counter;

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Private call has incorrect counter range")]
    fn start_counter_greater_than_end_counter() {
        let mut builder = TestBuilder::new();

        // Set start greater than end.
        builder.private_call.counter_start = builder.private_call.counter + 1;

        builder.rebuild_hints();
        builder.validate();
    }

    #[test(should_fail_with = "Mismatch counter: start of call request does not match hint")]
    fn private_call_request_start_counter_mismatch() {
        let mut builder = TestBuilder::new().with_call_requests();

        // Corrupt the start counter hint.
        builder.hints.sorted_side_effect_counters[0].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
    fn private_call_request_end_counter_mismatch() {
        let mut builder = TestBuilder::new().with_call_requests();

        // Corrupt the end counter hint (at index+1).
        builder.hints.sorted_side_effect_counters[1].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch global index: start of call request does not match hint")]
    fn private_call_request_start_global_index_mismatch() {
        let mut builder = TestBuilder::new().with_call_requests();

        // Corrupt the start global index hint.
        builder.hints.sorted_side_effect_counters[0].global_index += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch global index: end of call request does not match hint")]
    fn private_call_request_end_global_index_mismatch() {
        let mut builder = TestBuilder::new().with_call_requests();

        // Corrupt the end global index hint.
        builder.hints.sorted_side_effect_counters[1].global_index += 1;

        builder.validate();
    }

    /// Tests that private call request start and end hints must be adjacent.
    /// If they're not adjacent, another side effect could sneak into the reserved range.
    #[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
    fn private_call_request_non_adjacent_hints() {
        let mut builder = TestBuilder::new();
        builder.private_call.append_private_call_requests(1);
        builder.private_call.append_nullifiers(1);
        builder.rebuild_hints();

        // The private call request hints should be at indices 0 and 1 (start and end).
        // The nullifier should be at index 2.
        // Try to put the nullifier between the start and end hints.
        let start_hint = builder.hints.sorted_side_effect_counters[0];
        let end_hint = builder.hints.sorted_side_effect_counters[1];
        let nullifier_hint = builder.hints.sorted_side_effect_counters[2];

        // Reorder: start, nullifier, end (making start and end non-adjacent).
        builder.hints.sorted_side_effect_counters[0] = start_hint;
        builder.hints.sorted_side_effect_counters[1] = nullifier_hint;
        builder.hints.sorted_side_effect_counters[2] = end_hint;

        // Update indices to match new positions.
        builder.hints.nullifiers_indices[0] = 1;
        // private_call_requests_indices[0] stays at 0, but end is now at 2 not 1.
        // This will fail because index+1 (which is 1) won't have the end counter.

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch counter: value does not match hint")]
    fn min_revertible_counter_mismatch() {
        let mut builder = TestBuilder::new().with_min_revertible_side_effect_counter();

        // Find the index of the min_revertible hint and corrupt it.
        let index = builder.hints.min_revertible_side_effect_counter_index;
        builder.hints.sorted_side_effect_counters[index].counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Mismatch global index: value does not match hint")]
    fn min_revertible_global_index_mismatch() {
        let mut builder = TestBuilder::new().with_min_revertible_side_effect_counter();

        // Corrupt the global index in the hint.
        let index = builder.hints.min_revertible_side_effect_counter_index;
        builder.hints.sorted_side_effect_counters[index].global_index += 1;

        builder.validate();
    }

    // More tests for different side effect types that don't change the hints can be found in:
    // private_kernel_init/private_call_data/validate_side_effect_counters_tests.nr.
}
