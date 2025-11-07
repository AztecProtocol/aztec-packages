use types::{
    constants::MAX_U32_VALUE, side_effect::Ordered, traits::Empty, utils::arrays::find_first_index,
};

/// Verifies that an array of sorted and padded items is correctly transformed and split into two arrays based on a
/// given `split_counter` and the number of padded (dummy) items for the `transformed_array_lt` array.
///
/// ### Arguments
/// - `sorted_padded_array`: The array of items that have been sorted and padded with dummy items.
/// - `transformed_array_lt`: The transformed array of items whose counters are `< split_counter`.
/// - `transformed_array_gte`: The transformed array of items whose counters are `>= split_counter`.
/// - `split_counter`: The counter value used to divide items into the two arrays.
/// - `assert_transformed`: A user-provided assertion function that verifies the transformation of each item.
/// - `num_padded_lt`: A user-provided value indicating the amount of padded items belonging to `transformed_array_lt`.
///
/// ### Argument requirements:
/// - The `sorted_padded_array` must be dense trimmed:
///   - Items within `original_array.length` must not be nullish.
///   - Items beyond `original_array.length` must be nullish.
/// - Items within `original_array.length` in `original_array` must have been sorted by counter in ascending order.
/// - Items beyond `original_array.length` in `original_array` must have a counter of 0.
/// - `num_padded_lt` must not be larger than the total number of padded items and empty items in `sorted_padded_array`.
///
/// This function checks that:
/// 1. Each item in the `original_array` is correctly transformed and placed in either:
///    - `transformed_array_lt`: for items whose counters are **less than** `split_counter`.
///    - `transformed_array_gte`: for items with counters **greater than or equal to** `split_counter`.
/// 2. The correct number of padded items are added to both transformed arrays.
/// 3. All unused slots in both transformed arrays contain empty items.
///
/// ### Notes
/// - A padded (dummy) item is an item with a counter equal to `MAX_U32_VALUE`. They are added by the protocol in the
///   reset circuit to hide the actual number of side effects emitted in the tx.
/// - This function does not mutate the input arrays; it only validates correctness.
pub fn assert_split_transformed_arrays_from_sorted_padded_array<T, S, let N: u32, Env>(
    sorted_padded_array: [T; N],
    transformed_array_lt: [S; N],
    transformed_array_gte: [S; N],
    split_counter: u32,
    assert_transformed: fn[Env](T, S) -> (),
    num_padded_lt: u32,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // Safety: The hints are constrained by `assert_split_transformed_arrays_from_sorted_padded_array_with_hint`.
    let (first_after_split_index, first_padded_index) = unsafe {
        (
            find_first_index(sorted_padded_array, |n: T| n.counter() >= split_counter),
            find_first_index(sorted_padded_array, |n: T| n.counter() == MAX_U32_VALUE),
        )
    };

    assert_split_transformed_arrays_from_sorted_padded_array_with_hint(
        sorted_padded_array,
        transformed_array_lt,
        transformed_array_gte,
        split_counter,
        assert_transformed,
        num_padded_lt,
        first_after_split_index,
        first_padded_index,
    );
}

fn assert_split_transformed_arrays_from_sorted_padded_array_with_hint<T, S, let N: u32, Env>(
    sorted_padded_array: [T; N],
    transformed_array_lt: [S; N],
    transformed_array_gte: [S; N],
    split_counter: u32,
    assert_transformed: fn[Env](T, S) -> (),
    num_padded_lt: u32,
    first_after_split_index: u32,
    first_padded_index: u32,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // --- Validate the hints ---

    // Validate `first_after_split_index`:
    // sorted_padded_array[first_after_split_index - 1].counter() < split_counter <= sorted_padded_array[first_after_split_index].counter()
    if first_after_split_index != 0 {
        assert(
            sorted_padded_array[first_after_split_index - 1].counter() < split_counter,
            "first_after_split_index is too large",
        );
    }
    if first_after_split_index != N {
        let counter = sorted_padded_array[first_after_split_index].counter();
        // Note: An empty item (counter == 0) can also be the first item after the split counter.
        assert((counter == 0) | (counter >= split_counter), "incorrect first_after_split_index");
    }

    // Validate `first_padded_index`:
    // sorted_padded_array[first_padded_index - 1].counter() is not nullish, but sorted_padded_array[first_padded_index].counter() is nullish.
    if first_padded_index != 0 {
        assert(
            sorted_padded_array[first_padded_index - 1].counter() != MAX_U32_VALUE,
            "first_padded_index is too large",
        );
    }
    if first_padded_index != N {
        assert_eq(
            sorted_padded_array[first_padded_index].counter(),
            MAX_U32_VALUE,
            "incorrect first_padded_index",
        );
    }

    // Validate that the provided `num_padded_lt` is reasonable.
    // If `first_padded_gte_index` is > `N`, it will affect the validation of the padded items in the next step.
    let first_padded_gte_index = first_padded_index + num_padded_lt;
    assert(first_padded_gte_index <= N, "num_padded_lt is too large");

    // --- Initialize state tracking for the iteration ---
    //
    // TODO(MC): this section is difficult to understand.
    //
    // There are 4 phases in the iteration:
    // 1. Processing items that belong to the `_lt` array and are not padded: `non_padded_lt`
    // 2. Processing items that belong to the `_lt` array and are padded: `padded_lt`
    // 3. Processing items that belong to the `_gte` array and are not padded: `non_padded_gte`
    // 4. Processing items that belong to the `_gte` array and are padded: `padded_gte`
    //
    // Note that the empty trailing items in the `sorted_padded_array` will be processed in:
    // - Phase 2 if there are no padded items for the `_gte` array (`first_padded_gte_index` == `N`).
    // - Phase 4 otherwise.
    //
    // We can use the following statements to determine the phase:
    // if is_non_padded_lt {
    //     Phase 1
    // } else if is_padded_gte {
    //     Phase 4
    // } else if is_padded {
    //     Phase 2
    // } else {
    //     Phase 3
    // }
    let mut is_non_padded_lt = true;
    let mut is_padded = false;
    let mut is_padded_gte = false;
    let num_non_padded_lt = first_after_split_index;
    let num_non_padded_gte = first_padded_index - first_after_split_index;
    let num_lt = num_non_padded_lt + num_padded_lt;
    // --- Main loop to validate each mapping and padding ---
    for i in 0..N {
        is_non_padded_lt &= i != first_after_split_index;
        is_padded |= i == first_padded_index;
        is_padded_gte |= i == first_padded_gte_index;

        // Determine if the item should belong to the `_lt` array.
        let is_lt = is_non_padded_lt | (is_padded & !is_padded_gte);

        // Check that an item is copied and transformed correctly from `sorted_padded_array` to the destination array.
        // From:
        // sorted_padded_array: [...Phase_1, ...Phase_2, ...Phase_3, ...Phase_4]
        // To:
        // _lt: [...Phase_1, ...Phase_2, ...empty_items]
        // _gte: [...Phase_3, ...Phase_4, ...empty_items]
        let original = sorted_padded_array[i];
        // Determine target index in the destination arrays based on phase,
        let to_index = if is_non_padded_lt {
            i // Phase 1
        } else if is_padded_gte {
            i - num_lt // Phase 4
        } else if is_padded {
            i - num_non_padded_gte // Phase 2
        } else {
            i - num_non_padded_lt // Phase 3
        };
        // Get the value from the correct destination array.
        let transformed = if is_lt {
            transformed_array_lt[to_index]
        } else {
            transformed_array_gte[to_index]
        };
        // Assert the value is transformed from the original item correctly.
        assert_transformed(original, transformed);

        // For every item added to the `_lt` array, there is an empty item padded to the `_gte` array. And vice versa.
        // _lt: [...Phase_1, ...Phase_2, ...padded_from_Phase_3, ...padded_from_Phase_4]
        // _gte: [...Phase_3, ...Phase_4, ...padded_from_Phase_2, ...padded_from_Phase_1]
        let empty_index = if is_non_padded_lt {
            N - i - 1 // Phase 1
        } else if is_padded_gte {
            i // Phase 4
        } else if is_padded {
            N - to_index - 1 // Phase 2
        } else {
            i + num_padded_lt // Phase 3
        };
        // Get the value from the correct destination array.
        let padded_empty = if is_lt {
            transformed_array_gte[empty_index]
        } else {
            transformed_array_lt[empty_index]
        };
        // Assert an empty item is padded.
        assert(padded_empty.is_empty(), "array should be padded with empty items");
    }
}

mod tests {
    use super::{
        assert_split_transformed_arrays_from_sorted_padded_array,
        assert_split_transformed_arrays_from_sorted_padded_array_with_hint,
    };
    use types::{constants::MAX_U32_VALUE, tests::{types::TestValue, utils::pad_end}, traits::Empty};

    global NUM_TEST_ITEMS: u32 = 8;

    fn assert_transformed(from: TestValue, to: Field) -> () {
        assert_eq(from.value, to, "Invalid transformed value");
    }

    struct TestBuilder {
        sorted_padded_array: [TestValue; NUM_TEST_ITEMS],
        transformed_array_lt: [Field; NUM_TEST_ITEMS],
        transformed_array_gte: [Field; NUM_TEST_ITEMS],
        split_counter: u32,
        num_padded_lt: u32,
        first_after_split_index: u32,
        first_padded_index: u32,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let sorted_padded_array = pad_end([
                TestValue { value: 40, counter: 3 },
                TestValue { value: 30, counter: 7 },
                TestValue { value: 80, counter: 13 },
                TestValue { value: 20, counter: MAX_U32_VALUE },
                TestValue { value: 50, counter: MAX_U32_VALUE },
                TestValue { value: 10, counter: MAX_U32_VALUE },
            ]);

            let transformed_array_lt = pad_end([40, 30, 20]);

            let transformed_array_gte = pad_end([80, 50, 10]);

            TestBuilder {
                sorted_padded_array,
                transformed_array_lt,
                transformed_array_gte,
                split_counter: 12,
                num_padded_lt: 1,
                first_after_split_index: 2,
                first_padded_index: 3,
            }
        }

        pub fn new_without_padded() -> Self {
            let sorted_padded_array = pad_end([
                TestValue { value: 40, counter: 3 },
                TestValue { value: 30, counter: 7 },
                TestValue { value: 80, counter: 13 },
            ]);

            let transformed_array_lt = pad_end([40, 30]);

            let transformed_array_gte = pad_end([80]);

            TestBuilder {
                sorted_padded_array,
                transformed_array_lt,
                transformed_array_gte,
                split_counter: 12,
                num_padded_lt: 0,
                first_after_split_index: 2,
                first_padded_index: NUM_TEST_ITEMS,
            }
        }

        pub fn new_empty() -> Self {
            TestBuilder {
                sorted_padded_array: [TestValue::empty(); NUM_TEST_ITEMS],
                transformed_array_lt: [0; NUM_TEST_ITEMS],
                transformed_array_gte: [0; NUM_TEST_ITEMS],
                split_counter: 12,
                num_padded_lt: 0,
                first_after_split_index: 0,
                first_padded_index: 0,
            }
        }

        pub fn execute(self) {
            assert_split_transformed_arrays_from_sorted_padded_array(
                self.sorted_padded_array,
                self.transformed_array_lt,
                self.transformed_array_gte,
                self.split_counter,
                assert_transformed,
                self.num_padded_lt,
            );
        }

        pub fn execute_with_hint(self) {
            assert_split_transformed_arrays_from_sorted_padded_array_with_hint(
                self.sorted_padded_array,
                self.transformed_array_lt,
                self.transformed_array_gte,
                self.split_counter,
                assert_transformed,
                self.num_padded_lt,
                self.first_after_split_index,
                self.first_padded_index,
            );
        }
    }

    #[test]
    fn succeeds() {
        let builder = TestBuilder::new();
        builder.execute();
    }

    #[test]
    fn empty_non_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        // Make everything revertible.
        builder.split_counter = 1;

        builder.transformed_array_lt = pad_end([20]);
        builder.transformed_array_gte = pad_end([40, 30, 80, 50, 10]);

        builder.execute();
    }

    #[test]
    fn empty_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        // Make everything non-revertible.
        builder.split_counter = 99;

        builder.transformed_array_lt = pad_end([40, 30, 80, 20]);
        builder.transformed_array_gte = pad_end([50, 10]);

        builder.execute();
    }

    #[test]
    fn without_padded_succeeds() {
        let builder = TestBuilder::new_without_padded();
        builder.execute();
    }

    #[test]
    fn empty_succeeds() {
        let builder = TestBuilder::new_empty();
        builder.execute();
    }

    #[test(should_fail_with = "Invalid transformed value")]
    fn wrong_transformed_value_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_lt[1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "Invalid transformed value")]
    fn wrong_transformed_value_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_gte[1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn extra_non_empty_item_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_lt[3] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "Invalid transformed value")]
    fn extra_non_empty_item_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_gte[3] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn end_with_non_empty_item_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_lt[NUM_TEST_ITEMS - 1] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn end_with_non_empty_item_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_array_gte[NUM_TEST_ITEMS - 1] = 1;

        builder.execute();
    }

    /////////////////////////
    // With hint
    /////////////////////////

    #[test]
    fn assert_split_padded_transformed_arrays_with_hint__succeeds() {
        let builder = TestBuilder::new();
        builder.execute_with_hint();
    }

    #[test(should_fail_with = "incorrect first_after_split_index")]
    fn assert_split_padded_transformed_arrays_with_hint__first_after_split_index_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.first_after_split_index -= 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "first_after_split_index is too large")]
    fn assert_split_padded_transformed_arrays_with_hint__first_after_split_index_too_large_fails() {
        let mut builder = TestBuilder::new();

        builder.first_after_split_index += 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "incorrect first_padded_index")]
    fn assert_split_padded_transformed_arrays_with_hint__first_padded_index_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.first_padded_index -= 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "first_padded_index is too large")]
    fn assert_split_padded_transformed_arrays_with_hint__first_padded_index_too_large_fails() {
        let mut builder = TestBuilder::new();

        builder.first_padded_index += 1;

        builder.execute_with_hint();
    }
}
