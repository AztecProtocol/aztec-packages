pub mod get_order_hints;

use get_order_hints::{get_order_hints, OrderHints};
use types::{side_effect::Ordered, traits::Empty, utils::arrays::ClaimedLengthArray};

/// Validates that an array of items is correctly sorted and transformed into another array.
///
/// ### Arguments
/// - `original_array`: The original array of unsorted items with a claimed length.
/// - `sorted_transformed_array`: The array of items that have been sorted and transformed.
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
/// 1. Each item in the `original_array` is correctly transformed and placed in the `sorted_transformed_array`.
/// 2. The items within the `sorted_transformed_array` are sorted in ascending order by their (original) counters.
///
/// ### Notes
/// - Transformed values may not contain counters; the hints are built in this function to associate each transformed
///   item with its original counter.
/// - This function does not mutate the input arrays; it only validates correctness.
pub fn assert_sorted_transformed_array<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    sorted_transformed_array: [S; N],
    assert_transformed: fn[Env](T, S) -> (),
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // Safety: The hints are used by `assert_sorted_transformed_array_with_hints` to validate the input arrays more
    // efficiently.
    let hints = unsafe { get_order_hints(original_array.array) };

    assert_sorted_transformed_array_with_hints(
        original_array,
        sorted_transformed_array,
        assert_transformed,
        hints,
    );
}

fn assert_sorted_transformed_array_with_hints<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    sorted_transformed_array: [S; N],
    assert_transformed: fn[Env](T, S) -> (),
    hints: OrderHints<N>,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    let mut should_be_empty = false;
    for i in 0..N {
        should_be_empty |= i == original_array.length;

        let original = original_array.array[i];

        let sorted_index = if should_be_empty {
            // All empty items beyond `original_array.length` are mapped to the same index in `sorted_transformed_array`
            // ensuring all items beyond `original_array.length` in the `sorted_transformed_array` are also empty.
            i
        } else {
            // Since items within `original_array.length` have unique non-zero counters, and cannot be empty,
            // the hinted `sorted_index` must fall within the range [0, original_array.length).
            hints.sorted_indexes[i]
        };
        let transformed_value = sorted_transformed_array[sorted_index];
        let hinted_counter = hints.sorted_counters[sorted_index];

        // Validate that the transformation from the original to the transformed value is correct.
        assert_transformed(original, transformed_value);

        // Ensure that the hinted counter matches the original item's counter.
        assert_eq(hinted_counter, original.counter(), "Incorrect hinted counter");

        if !should_be_empty {
            // Validate that counters within the range [0, original_array.length) are strictly increasing.
            if i != 0 {
                assert(
                    hints.sorted_counters[i] > hints.sorted_counters[i - 1],
                    "sorted_transformed_array must be sorted by counter in ascending order",
                );
            }
        }
    }
}

mod tests {
    use super::{
        assert_sorted_transformed_array_with_hints,
        get_order_hints::{get_order_hints, OrderHints},
    };
    use types::{tests::{types::TestValue, utils::pad_end}, utils::arrays::ClaimedLengthArray};

    struct TestBuilder<let N: u32> {
        original_array: ClaimedLengthArray<TestValue, N>,
        sorted_transformed_array: [Field; N],
        hints: OrderHints<N>,
    }

    impl<let N: u32> TestBuilder<N> {
        pub fn new<let M: u32>(original_values: [TestValue; M]) -> Self {
            let original_array = ClaimedLengthArray { array: pad_end(original_values), length: M };

            // Safety: This is for testing.
            let hints = unsafe { get_order_hints(original_array.array) };

            let mut sorted_transformed_array = [0; N];
            for i in 0..M {
                let sorted_index = hints.sorted_indexes[i];
                sorted_transformed_array[sorted_index] = original_values[i].value;
            }

            TestBuilder { original_array, sorted_transformed_array, hints }
        }

        pub fn execute(self) {
            assert_sorted_transformed_array_with_hints(
                self.original_array,
                self.sorted_transformed_array,
                |original, transformed| {
                    assert_eq(original.value, transformed, "Incorrect transformed value")
                },
                self.hints,
            );
        }
    }

    impl TestBuilder<6> {
        pub fn default() -> Self {
            Self::new([
                TestValue { value: 1, counter: 44 },
                TestValue { value: 2, counter: 22 },
                TestValue { value: 3, counter: 11 },
                TestValue { value: 4, counter: 33 },
            ])
        }
    }

    #[test]
    fn default_setup() {
        let builder = TestBuilder::default();
        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn mismatch_transformed_value() {
        let mut builder = TestBuilder::default();

        // Tweak the value at index 1.
        builder.sorted_transformed_array[1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn extra_non_empty_transformed_value() {
        let mut builder = TestBuilder::default();

        // Add a random transformed value.
        builder.sorted_transformed_array[5] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn missing_transformed_value() {
        let mut builder = TestBuilder::default();

        // Remove a value from the transformed array.
        builder.sorted_transformed_array[3] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn unordered_values() {
        let mut builder = TestBuilder::<6>::new([
            TestValue { value: 1, counter: 22 },
            TestValue { value: 2, counter: 33 },
            TestValue { value: 3, counter: 11 },
        ]);
        // Sorted array should be: [3, 1, 2]

        // Change the sorted array to be unsorted.
        builder.sorted_transformed_array = pad_end([3, 2, 1]);

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect hinted counter")]
    fn unordered_values_with_updated_hints() {
        let mut builder = TestBuilder::<6>::new([
            TestValue { value: 1, counter: 22 },
            TestValue { value: 2, counter: 33 },
            TestValue { value: 3, counter: 11 },
        ]);
        // Sorted array should be: [3, 1, 2]

        // Change the sorted array to be unsorted.
        builder.sorted_transformed_array = pad_end([3, 2, 1]);

        // Update the sorted indexes to point to the new positions.
        builder.hints.sorted_indexes[0] = 2;
        builder.hints.sorted_indexes[1] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "sorted_transformed_array must be sorted by counter in ascending order")]
    fn unordered_values_with_updated_hints_and_counters() {
        let mut builder = TestBuilder::<6>::new([
            TestValue { value: 1, counter: 22 },
            TestValue { value: 2, counter: 33 },
            TestValue { value: 3, counter: 11 },
        ]);
        // Sorted array should be: [3, 1, 2]

        // Change the sorted array to be unsorted.
        builder.sorted_transformed_array = pad_end([3, 2, 1]);

        // Update the sorted indexes to point to the new positions.
        builder.hints.sorted_indexes[0] = 2;
        builder.hints.sorted_indexes[1] = 1;

        // Update the hinted counters.
        builder.hints.sorted_counters[1] = 33;
        builder.hints.sorted_counters[2] = 22;

        builder.execute();
    }
}
