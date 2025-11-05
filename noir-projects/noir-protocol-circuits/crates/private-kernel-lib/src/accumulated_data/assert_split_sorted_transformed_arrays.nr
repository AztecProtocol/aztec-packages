pub mod get_split_order_hints;

use get_split_order_hints::{get_split_order_hints, SplitOrderHints};
use types::{side_effect::Ordered, traits::Empty, utils::arrays::ClaimedLengthArray};

/// Verifies that an array of items is correctly sorted, transformed, and split into two arrays based on a given
/// `split_counter`.
///
/// ### Arguments
/// - `original_array`: The original array of unsorted items with a claimed length.
/// - `sorted_transformed_array_lt`: The transformed and sorted array of items whose counters are `< split_counter`.
/// - `sorted_transformed_array_gte`: The transformed and sorted array of items whose counters are `>= split_counter`.
/// - `split_counter`: The counter value used to divide items into the two arrays.
/// - `assert_transformed`: A user-provided assertion function that verifies the transformation of each item.
///
/// ### Argument requirements:
/// - The `original_array` must be dense trimmed:
///   - Items within `original_array.length` must not be nullish.
///   - Items beyond `original_array.length` must be nullish.
/// - Items within `original_array.length` in `original_array` must have unique non-zero counters.
/// - `assert_transformed` must guarantee that the transformed value is nullish if and only if the original item is
///   nullish.
///
/// This function checks that:
/// 1. Each item in the `original_array` is correctly transformed and placed in either:
///    - `sorted_transformed_array_lt`: for items with counters **less than** `split_counter`.
///    - `sorted_transformed_array_gte`: for items with counters **greater than or equal to** `split_counter`.
/// 2. The items within each of the two transformed arrays are sorted in strictly ascending order by their counters.
/// 3. All unused slots in both transformed arrays contain empty items.
///
/// ### Notes
/// - Transformed values may not contain counters; the hints are used to associate each transformed item with its
///   original counter.
/// - This function does not mutate the input arrays; it only validates correctness.
pub fn assert_split_sorted_transformed_arrays<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    sorted_transformed_array_lt: [S; N],
    sorted_transformed_array_gte: [S; N],
    split_counter: u32,
    assert_transformed: fn[Env](T, S) -> (),
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // Safety: The hints are used by `assert_split_sorted_transformed_arrays_with_hints` to validate the input arrays
    // more efficiently.
    let hints = unsafe { get_split_order_hints(original_array.array, split_counter) };

    assert_split_sorted_transformed_arrays_with_hints(
        original_array,
        sorted_transformed_array_lt,
        sorted_transformed_array_gte,
        split_counter,
        assert_transformed,
        hints,
    );
}

pub fn assert_split_sorted_transformed_arrays_with_hints<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    sorted_transformed_array_lt: [S; N],
    sorted_transformed_array_gte: [S; N],
    split_counter: u32,
    assert_transformed: fn[Env](T, S) -> (),
    hints: SplitOrderHints<N>,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut should_be_empty = false;
    for i in 0..N {
        should_be_empty |= i == original_array.length;

        let original = original_array.array[i];
        let sorted_index = if should_be_empty {
            // All empty items beyond `original_array.length` are mapped to the same index in the `_lt` array.
            i
        } else {
            hints.sorted_indexes[i]
        };

        let is_lt = original.counter() < split_counter;

        // Get the value and counter from the corresponding sorted arrays.
        let (sorted_value, sorted_counter) = if is_lt {
            (sorted_transformed_array_lt[sorted_index], hints.sorted_counters_lt[sorted_index])
        } else {
            (sorted_transformed_array_gte[sorted_index], hints.sorted_counters_gte[sorted_index])
        };

        // Validate that the transformation from the original to the sorted value is correct.
        assert_transformed(original, sorted_value);

        // Assert that the hinted counter matches the original item's counter.
        assert_eq(original.counter(), sorted_counter, "Mismatch counters");

        if !should_be_empty {
            // Update the number of items for the corresponding array.
            if is_lt {
                num_lt += 1;
            } else {
                num_gte += 1;
            }
        }
    }

    for i in 0..N {
        if i >= num_lt {
            // Ensure that items beyond `num_lt` are empty.
            // Because items within `original_array.length` must not be empty or have zero counters. By ensuring that
            // the trailing items in the transformed array are empty, we can be certain that the `num_lt` items
            // (and their counters) we processed previously occupy indices 0 to `num_lt - 1`.
            assert(
                sorted_transformed_array_lt[i].is_empty(),
                "Unexpected non-empty item in lt array",
            );
        } else if i != 0 {
            // Validate that counters within the range [0, num_lt) are strictly increasing.
            // We've previously verified that the counter for `sorted_transformed_array_lt[i]` is stored in
            // `hints.sorted_counters_lt[i]`, so this check implies that the values in `sorted_transformed_array_lt`
            // are indeed sorted by their original counters in ascending order.
            let counter = hints.sorted_counters_lt[i];
            let prev_counter = hints.sorted_counters_lt[i - 1];
            assert(counter > prev_counter, "Transformed lt array must be sorted by counter");
        }

        // The same logic applies to the `_gte` arrays.
        if i >= num_gte {
            assert(
                sorted_transformed_array_gte[i].is_empty(),
                "Unexpected non-empty item in gte array",
            );
        } else if i != 0 {
            let counter = hints.sorted_counters_gte[i];
            let prev_counter = hints.sorted_counters_gte[i - 1];
            assert(counter > prev_counter, "Transformed gte array must be sorted by counter");
        }
    }
}

mod tests {
    use super::{
        assert_split_sorted_transformed_arrays_with_hints,
        get_split_order_hints::{get_split_order_hints, SplitOrderHints},
    };
    use types::{
        tests::{types::TestValue, utils::pad_end},
        utils::arrays::{ClaimedLengthArray, find_first_index},
    };

    struct TestBuilder<let N: u32> {
        original_array: ClaimedLengthArray<TestValue, N>,
        sorted_transformed_array_lt: [Field; N],
        sorted_transformed_array_gte: [Field; N],
        split_counter: u32,
        hints: SplitOrderHints<N>,
    }

    impl<let N: u32> TestBuilder<N> {
        pub fn new<let Len: u32>(original_values: [TestValue; Len], split_counter: u32) -> Self {
            let mut sorted_transformed_array_lt = [0; N];
            let mut sorted_transformed_array_gte = [0; N];
            let mut num_lt = 0;
            let mut num_gte = 0;
            for i in 0..Len {
                if original_values[i].counter < split_counter {
                    sorted_transformed_array_lt[num_lt] = original_values[i].value;
                    num_lt += 1;
                } else {
                    sorted_transformed_array_gte[num_gte] = original_values[i].value;
                    num_gte += 1;
                }
            }

            let original_array =
                ClaimedLengthArray { array: pad_end(original_values), length: Len };

            // Safety: This is for testing.
            let hints = unsafe { get_split_order_hints(original_array.array, split_counter) };

            TestBuilder {
                original_array,
                sorted_transformed_array_lt,
                sorted_transformed_array_gte,
                split_counter,
                hints,
            }
        }

        pub fn get_original_index(self, sorted_index: u32, is_lt: bool) -> u32 {
            let counter = if is_lt {
                self.hints.sorted_counters_lt[sorted_index]
            } else {
                self.hints.sorted_counters_gte[sorted_index]
            };
            // Safety: This is for testing.
            unsafe {
                find_first_index(self.original_array.array, |item| item.counter == counter)
            }
        }

        pub fn execute(self) {
            assert_split_sorted_transformed_arrays_with_hints(
                self.original_array,
                self.sorted_transformed_array_lt,
                self.sorted_transformed_array_gte,
                self.split_counter,
                |original, transformed| {
                    assert_eq(original.value, transformed, "Incorrect transformed value")
                },
                self.hints,
            );
        }
    }

    impl TestBuilder<8> {
        pub fn default() -> Self {
            let original_values = [
                TestValue { value: 1, counter: 33 },
                TestValue { value: 2, counter: 44 },
                TestValue { value: 3, counter: 11 },
                TestValue { value: 4, counter: 55 },
                TestValue { value: 5, counter: 22 },
            ];
            Self::new(original_values, 25)
        }
    }

    #[test]
    fn empty_original_array() {
        let builder = TestBuilder::<4>::new([], 25);
        builder.execute();
    }

    #[test]
    fn correct_default_setup() {
        let builder = TestBuilder::default();
        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn empty_original_with_non_empty_item_in_lt() {
        let mut builder = TestBuilder::<4>::new([], 25);

        builder.sorted_transformed_array_lt[0] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn mismatch_value_in_lt() {
        let mut builder = TestBuilder::default();

        builder.sorted_transformed_array_lt[0] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn mismatch_value_in_gte() {
        let mut builder = TestBuilder::default();

        // Swap two values in the sorted array.
        let tmp = builder.sorted_transformed_array_gte[0];
        builder.sorted_transformed_array_gte[0] = builder.sorted_transformed_array_gte[1];
        builder.sorted_transformed_array_gte[1] = tmp;

        builder.execute();
    }

    #[test(should_fail_with = "Mismatch counters")]
    fn swap_values_in_gte() {
        let mut builder = TestBuilder::default();

        // Swap two values in the sorted array.
        let tmp = builder.sorted_transformed_array_gte[0];
        builder.sorted_transformed_array_gte[0] = builder.sorted_transformed_array_gte[1];
        builder.sorted_transformed_array_gte[1] = tmp;
        // Update the hints to map the original items to the sorted values in their new positions.
        let original_index_0 = builder.get_original_index(0, false);
        let original_index_1 = builder.get_original_index(1, false);
        builder.hints.sorted_indexes[original_index_0] = 1;
        builder.hints.sorted_indexes[original_index_1] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Transformed gte array must be sorted by counter")]
    fn items_not_sorted_in_gte() {
        let mut builder = TestBuilder::default();

        // Swap two values in the sorted array.
        let tmp = builder.sorted_transformed_array_gte[0];
        builder.sorted_transformed_array_gte[0] = builder.sorted_transformed_array_gte[1];
        builder.sorted_transformed_array_gte[1] = tmp;
        // Update the hints to map the original items to the sorted values in their new positions.
        let original_index_0 = builder.get_original_index(0, false);
        let original_index_1 = builder.get_original_index(1, false);
        builder.hints.sorted_indexes[original_index_0] = 1;
        builder.hints.sorted_indexes[original_index_1] = 0;
        // Swap the sorted counters.
        let tmp = builder.hints.sorted_counters_gte[0];
        builder.hints.sorted_counters_gte[0] = builder.hints.sorted_counters_gte[1];
        builder.hints.sorted_counters_gte[1] = tmp;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn misplace_item_from_lt_to_gte() {
        let mut builder = TestBuilder::default();

        // Change the split counter to 15. So the item with counter 22 should be in _gte.
        builder.split_counter = 15;

        builder.execute();
    }

    #[test(should_fail_with = "Unexpected non-empty item in lt array")]
    fn extra_items_in_lt() {
        let mut builder = TestBuilder::default();

        // Add an extra item to _lt.
        builder.sorted_transformed_array_lt[4] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "Unexpected non-empty item in gte array")]
    fn duplicate_items_in_gte() {
        let mut builder = TestBuilder::default();

        // Duplicate an item in _gte.
        builder.sorted_transformed_array_gte[3] = builder.sorted_transformed_array_gte[2];
        builder.hints.sorted_counters_gte[3] = builder.hints.sorted_counters_gte[2];

        builder.execute();
    }

    #[test(should_fail_with = "Transformed lt array must be sorted by counter")]
    fn items_with_duplicate_counter() {
        let mut builder = TestBuilder::<6>::new(
            [
                TestValue { value: 1, counter: 11 },
                TestValue { value: 2, counter: 22 },
                // This is not allowed.
                TestValue { value: 3, counter: 22 },
            ],
            25,
        );
        builder.hints.sorted_indexes = pad_end([0, 1, 2]);
        builder.hints.sorted_counters_lt = pad_end([11, 22, 22]);

        builder.execute();
    }
}
