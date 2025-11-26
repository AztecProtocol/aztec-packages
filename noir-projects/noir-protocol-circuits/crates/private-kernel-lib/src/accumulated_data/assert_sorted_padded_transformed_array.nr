pub mod check_padded_items;

use super::assert_sorted_transformed_array::get_order_hints::get_order_hints;
use types::{
    constants::MAX_U32_VALUE, side_effect::Ordered, traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// Validates that the `sorted_padded_transformed_array` is sorted in ascending order by counter and that all
/// transformations and padding are correctly applied.
///
/// ### Arguments
/// - `original_array`: The original array of unsorted items with a claimed length.
/// - `padded_items`: The array of padded items to be added to the `sorted_padded_transformed_array`.
/// - `sorted_padded_transformed_array`: The array of items that have been sorted, padded, and transformed.
/// - `assert_transformed`: A user-provided assertion function that verifies the transformation of each item.
///
/// ### Argument requirements:
/// - Items within `original_array.length` in `original_array` must have unique non-zero counters.
/// - Items within `original_array.length` in `original_array` must not have a counter of `MAX_U32_VALUE`.
/// - All items in `padded_items` must have a counter of `MAX_U32_VALUE` or 0.
/// - The items to be padded should start at index `original_array.length` in `padded_items`.
/// - `assert_transformed` must guarantee that the transformed value is empty if and only if the original item is empty.
///
/// This function checks that:
/// 1. Each item in the `original_array` is correctly transformed and placed in the `sorted_padded_transformed_array`.
/// 2. The items within the `sorted_padded_transformed_array` are sorted in ascending order by their counters.
/// 3. The items in the `padded_items` within the range [original_array.length, CappedSize) are correctly padded to the
///    `sorted_padded_transformed_array` after the `original_array.length` items from `original_array`.
/// 4. All items within the claimed length in the `sorted_padded_transformed_array` must have non-zero counter.
/// 5. All items beyond the claimed length in the `sorted_padded_transformed_array` must have zero counter.
///
/// ### Notes:
/// 1. `CappedSize` must be large enough to cover all valid items in `original_array`
///    (i.e. `CappedSize >= original_array.length`).
/// 2. Items in `padded_items` with index < `original_array.length` or >= `CappedSize` are ignored.
/// 3. `is_transformed` does not need to validate counters. This function ensures that each item in
///    `sorted_padded_transformed_array` has the same counter as its corresponding item in either `original_array` or
///    `padded_items`.
/// 4. This function can only be called at most once per side effect type. Once padded items have been added to the
///   `sorted_padded_transformed_array`, the array cannot be used again as the `original_array` for this function.
/// 5. The items beyond `CappedSize` in the `sorted_padded_transformed_array` must have a counter of 0, but their values
///    are not checked here. However, if any of them are not nullish, the tail circuits will fail to validate that the
///    array is "dense trimmed". The non-nullish values cannot be used for squashing, since they are beyond the claimed
///    length of the array.
///
/// Expected structure of the output `sorted_padded_transformed_array`:
///   [...sorted_items_from_original_array, ...padded_items, ...empty_items]
///
/// Example:
/// original_array: [v, v, v, v | ?, ?, ?, ?, ? | ?, ?, ?]
/// padded_items:   [?, ?, ?, ? | p, p, p, p, p | ?, ?, ?]
///                             ^               ^
///                             |               |
///                       original length       |
///                                             |
///                                         CappedSize
/// output:         [v, v, v, v | p, p, p, p, p | 0, 0, 0]
///
pub fn assert_sorted_padded_transformed_array_capped_size<Value, TransformedValue, let N: u32, Env, let CappedSize: u32>(
    original_array: ClaimedLengthArray<Value, N>, // "kept" values (after squashing)
    padded_items: [Value; N],
    sorted_padded_transformed_array: ClaimedLengthArray<TransformedValue, N>,
    // "Transformed" here means: "assert siloed" or "assert siloed & unique-ified".
    assert_transformed: fn[Env](Value, TransformedValue) -> (),
)
where
    Value: Ordered + Empty,
    TransformedValue: Ordered + Empty,
{
    assert_sorted_padded_transformed_i_array_capped_size::<_, _, _, _, CappedSize>(
        original_array,
        padded_items,
        sorted_padded_transformed_array,
        |prev, out, _i| assert_transformed(prev, out),
    );
}

unconstrained fn get_num_padded_items<Value, let N: u32>(
    padded_items: [Value; N],
    original_array_length: u32,
    CappedSize: u32,
) -> u32
where
    Value: Ordered,
{
    let mut num_padded_items = 0;
    for i in original_array_length..CappedSize {
        if padded_items[i].counter() == MAX_U32_VALUE {
            num_padded_items += 1;
        }
    }
    num_padded_items
}

/// Same as `assert_sorted_padded_transformed_array_capped_size`, but the callback `assert_transformed_i` has an
/// additional index (`i`) argument.
/// Used for note hashes to compute the unique note hash value with the index.
pub fn assert_sorted_padded_transformed_i_array_capped_size<Value, TransformedValue, let N: u32, Env, let CappedSize: u32>(
    original_array: ClaimedLengthArray<Value, N>,
    padded_items: [Value; N],
    sorted_padded_transformed_array: ClaimedLengthArray<TransformedValue, N>,
    assert_transformed_i: fn[Env](Value, TransformedValue, u32) -> (),
)
where
    Value: Ordered + Empty,
    TransformedValue: Ordered + Empty,
{
    // Safety: The hints are constrained by `assert_sorted_padded_transformed_i_array_capped_size_with_hints`.
    let (sorted_index_hints, num_padded_items) = unsafe {
        let sorted_indexes = get_order_hints(original_array.array).sorted_indexes;
        let num_padded_items =
            get_num_padded_items(padded_items, original_array.length, CappedSize);
        (sorted_indexes, num_padded_items)
    };

    assert_sorted_padded_transformed_i_array_capped_size_with_hints::<_, _, _, _, CappedSize>(
        original_array,
        padded_items,
        sorted_padded_transformed_array,
        assert_transformed_i,
        sorted_index_hints,
        num_padded_items,
    )
}

fn assert_sorted_padded_transformed_i_array_capped_size_with_hints<Value, TransformedValue, let N: u32, Env, let CappedSize: u32>(
    original_array: ClaimedLengthArray<Value, N>,
    padded_items: [Value; N],
    sorted_padded_transformed_array: ClaimedLengthArray<TransformedValue, N>,
    assert_transformed_i: fn[Env](Value, TransformedValue, u32) -> (),
    sorted_index_hints: [u32; N],
    num_padded_items: u32,
)
where
    Value: Ordered + Empty,
    TransformedValue: Ordered + Empty,
{
    let original_array_length = original_array.length;
    assert(
        original_array_length <= CappedSize,
        "CappedSize not large enough to cover all valid items in original_array",
    );

    // The claimed length of the result array is the original array length plus the hinted number of padded items.
    // It is checked below to ensure that all items within the claimed length do not have a counter of 0.
    let result_array_length = original_array_length + num_padded_items;

    let mut should_be_padded = false;
    let mut should_be_empty = false;
    for i in 0..N {
        let output_item_i = sorted_padded_transformed_array.array[i];

        // Note: because `CappedSize` is known at compile-time, Noir is clever enough to only compute the `else` block
        // `CappedSize` number of times, instead of `N` times.
        // This is why we do siloing (via `assert_transformed_i`) in the reset circuit instead of the tail: we can
        // iterate over much smaller arrays by choosing a proper reset circuit variant.
        if i >= CappedSize {
            // Ensure that all items with index >= `CappedSize` have a counter of 0.
            // It's fine that the value is not checked here, see Note 5 in the comment at the top to know why.
            // Without this check, an original item can be mapped to a trailing item.
            // For an example, see the test `use_items_outside_of_capped_size_to_add_random_item`.
            // Comment out this check and the test will fail because no error is raised.
            assert_eq(output_item_i.counter(), 0, "Trailing items must have counter 0");
        } else {
            should_be_padded |= i == original_array_length;
            should_be_empty |= i == result_array_length;

            let original = original_array.array[i];
            let sorted_index = sorted_index_hints[i];
            let padded_item = padded_items[i];

            let (from, to_index) = if should_be_padded {
                // For i >= `original_array.length`, `sorted_padded_transformed_array[i]` is from `padded_items[i]`.
                (padded_item, i)
            } else {
                // For i < `original_array.length`, we loop through the items in `original_array`, ensuring that every
                // item within the range [0, original_array.length) is mapped to an item in the
                // `sorted_padded_transformed_array` at `sorted_index`.
                //
                // We can be certain that `sorted_index` must be < `original_array.length`, because:
                // - Items with index >= `CappedSize` in the `sorted_padded_transformed_array` have counter 0 (checked
                //   in the above `if` block).
                // - Items within the range [original_array.length, CappedSize) in the `sorted_padded_transformed_array`
                //   are padded items, which must have a counter of `MAX_U32_VALUE` or 0.
                // - Items within the range [0, original_array.length) in the `original_array` must not have a counter
                //   of 0 (requirement of the parameter) or `MAX_U32_VALUE` (checked above).
                (original, sorted_index)
            };

            // Validate that the transformation of the value is correct.
            let to = sorted_padded_transformed_array.array[to_index];
            assert_transformed_i(from, to, to_index);

            // Validate that the counter of the transformed item matches the counter of the original/padded item.
            assert_eq(from.counter(), to.counter(), "mapped item has mismatch counter");

            if !should_be_padded {
                // Validate that counters within the range [0, original_array.length) are strictly increasing.
                // Since all items within the range [0, original_array.length) in the `original_array` must have a
                // unique counter (a requirement of the parameter), this check guarantees that all items in the
                // `sorted_padded_transformed_array` within the same range can't be skipped or mapped to more than once.
                if i != 0 {
                    assert(
                        output_item_i.counter()
                            > sorted_padded_transformed_array.array[i - 1].counter(),
                        "value array must be sorted by counter in ascending order",
                    );
                }
            }

            // Validate that all items within the claimed length of the `sorted_padded_transformed_array` do not have a
            // counter of 0, and items beyond the claimed length must have a counter of 0.
            // Without this check, the hinted `num_padded_items` could be larger than the number of non-empty padded
            // items, allowing empty items within the claimed length of the `sorted_padded_transformed_array`. And the
            // empty items can be used to add random items to the `sorted_padded_transformed_array` if this function
            // is called again.
            // For an example, see the test `use_empty_items_within_claimed_length_to_add_random_item`.
            // Comment out this check and the test will fail because no error is raised.
            assert_eq(
                to.counter() == 0,
                should_be_empty,
                "Incorrect hinted number of padded items",
            );

            // The following check is no longer necessary since we now enforce in the reset circuit that this function
            // can only be called at most once per side effect type.
            //
            // Ensure that items in `original_array` do not have a counter of `MAX_U32_VALUE`.
            // This prevents an array from being padded twice, which would allow a random item to be added to the
            // `output_array` by creating duplicated padded items.
            // For an example, see the test `use_duplicate_padded_items_to_add_random_item`.
            // Comment out this check and the test will fail because no error is raised.
            // assert(
            //     original.counter() != MAX_U32_VALUE,
            //     "max counter value is reserved for padded items",
            // );
        }
    }

    // Validate that the length of the `sorted_padded_transformed_array` is the `original_array_length` plus the hinted
    // `num_padded_items`.
    assert_eq(sorted_padded_transformed_array.length, result_array_length);
}

mod tests {
    use crate::accumulated_data::{
        assert_sorted_transformed_array::get_order_hints::get_order_hints,
        sort_by_counter::sort_by_counter,
    };
    use super::{
        assert_sorted_padded_transformed_i_array_capped_size,
        assert_sorted_padded_transformed_i_array_capped_size_with_hints,
    };
    use types::{
        constants::MAX_U32_VALUE,
        tests::{types::TestValue, utils::pad_end},
        traits::Empty,
        utils::arrays::ClaimedLengthArray,
    };

    fn transform_i(original: TestValue, sorted_index: u32) -> TestValue {
        let value = if original.value == 0 {
            0
        } else {
            original.value + sorted_index as Field
        };
        TestValue { value, counter: original.counter }
    }

    struct TestDataBuilder<let N: u32> {
        original_array: ClaimedLengthArray<TestValue, N>,
        padded_items: [TestValue; N],
        sorted_padded_transformed_array: ClaimedLengthArray<TestValue, N>,
        sorted_index_hints: [u32; N],
        padded_start_index: u32,
        num_padded_items: u32,
        assert_transformed: fn(TestValue, TestValue, u32) -> (),
    }

    impl<let N: u32> TestDataBuilder<N> {
        pub fn new<let M: u32, let P: u32>(
            original_values: [TestValue; M],
            padded_values: [TestValue; P],
        ) -> Self {
            let original_array = ClaimedLengthArray {
                array: pad_end(original_values),
                length: original_values.len(),
            };

            let mut padded_items = [TestValue::empty(); N];
            for i in 0..P {
                padded_items[M + i] = padded_values[i];
            }

            // Safety: This is for testing.
            let sorted_index_hints =
                unsafe { get_order_hints(original_array.array).sorted_indexes };

            // Safety: This is for testing.
            let sorted = unsafe { sort_by_counter(original_values) };
            let sorted_padded_transformed_array =
                ClaimedLengthArray { array: pad_end(sorted.concat(padded_values)), length: M + P };

            TestDataBuilder {
                original_array,
                padded_items,
                sorted_padded_transformed_array,
                sorted_index_hints,
                padded_start_index: M,
                num_padded_items: P,
                assert_transformed: |from: TestValue, to: TestValue, _index: u32| {
                    assert_eq(from.value, to.value, "Incorrect transformed value");
                },
            }
        }

        pub fn transform_i(&mut self) -> Self {
            self.sorted_padded_transformed_array.array =
                self.sorted_padded_transformed_array.array.mapi(|i, v| transform_i(v, i));
            self.assert_transformed = |from: TestValue, to: TestValue, index: u32| {
                assert_eq(
                    transform_i(from, index).value,
                    to.value,
                    "Incorrect transformed value with index",
                );
            };
            *self
        }

        pub fn execute_capped<let CappedSize: u32>(self) {
            assert_sorted_padded_transformed_i_array_capped_size::<_, _, _, _, CappedSize>(
                self.original_array,
                self.padded_items,
                self.sorted_padded_transformed_array,
                self.assert_transformed,
            );
        }

        pub fn execute_with_hints_capped<let CappedSize: u32>(self) {
            assert_sorted_padded_transformed_i_array_capped_size_with_hints::<_, _, _, _, CappedSize>(
                self.original_array,
                self.padded_items,
                self.sorted_padded_transformed_array,
                self.assert_transformed,
                self.sorted_index_hints,
                self.num_padded_items,
            );
        }
    }
    impl TestDataBuilder<8> {
        pub fn default() -> Self {
            let original_values = [
                TestValue { value: 1, counter: 33 },
                TestValue { value: 2, counter: 22 },
                TestValue { value: 3, counter: 11 },
            ];

            let padded_values = [
                TestValue { value: 99, counter: MAX_U32_VALUE },
                TestValue { value: 88, counter: MAX_U32_VALUE },
            ];

            Self::new(original_values, padded_values)
        }

        pub fn default_without_padding() -> Self {
            Self::new(
                [
                    TestValue { value: 1, counter: 33 },
                    TestValue { value: 2, counter: 22 },
                    TestValue { value: 3, counter: 11 },
                ],
                [],
            )
        }

        pub fn default_without_original() -> Self {
            Self::new(
                [],
                [
                    TestValue { value: 99, counter: MAX_U32_VALUE },
                    TestValue { value: 88, counter: MAX_U32_VALUE },
                ],
            )
        }

        pub fn execute(self) {
            self.execute_capped::<6>();
        }

        pub fn execute_with_hints(self) {
            self.execute_with_hints_capped::<6>();
        }
    }

    #[test]
    fn default_setup() {
        let builder = TestDataBuilder::default();
        builder.execute();
    }

    #[test]
    fn default_setup_with_transform_i() {
        let builder = TestDataBuilder::default().transform_i();
        builder.execute();
    }

    #[test]
    fn default_without_original() {
        let builder = TestDataBuilder::default_without_original();
        builder.execute();
    }

    #[test]
    fn default_without_padding() {
        let builder = TestDataBuilder::default_without_padding();
        builder.execute();
    }

    #[test]
    fn all_empty() {
        let builder = TestDataBuilder::<8>::new([], []);
        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn mismatch_original_value() {
        let mut builder = TestDataBuilder::default();

        // Tweak the value at index 1.
        builder.sorted_padded_transformed_array.array[1].value += 1;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn mismatch_padded_value() {
        let mut builder = TestDataBuilder::default();

        // Tweak the value at index 4, which is a padded item.
        builder.sorted_padded_transformed_array.array[4].value += 1;

        builder.execute();
    }

    #[test(should_fail_with = "value array must be sorted by counter in ascending order")]
    fn unsorted_result_array() {
        let mut builder = TestDataBuilder::default();

        // Swap the values at index 1 and 2.
        let tmp = builder.sorted_padded_transformed_array.array[1];
        builder.sorted_padded_transformed_array.array[1] =
            builder.sorted_padded_transformed_array.array[2];
        builder.sorted_padded_transformed_array.array[2] = tmp;

        // Update sorted indexes.
        // Original: 33, 22, 11
        // Tweaked result: 11, 33, 22
        builder.sorted_index_hints[0] = 1;
        builder.sorted_index_hints[1] = 2;
        builder.sorted_index_hints[2] = 0;

        builder.execute_with_hints();
    }

    #[test]
    fn extra_non_empty_value() {
        let mut builder = TestDataBuilder::default();

        // Set value to an empty item.
        builder.sorted_padded_transformed_array.array[6].value = 1;

        // The test should pass because we don't check the value of the trailing items here.
        // It should be caught by the tail circuits.
        builder.execute();
    }

    #[test(should_fail_with = "Trailing items must have counter 0")]
    fn extra_non_empty_counter() {
        let mut builder = TestDataBuilder::default();

        // Set counter to an empty item.
        builder.sorted_padded_transformed_array.array[6].counter = MAX_U32_VALUE;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn duplicate_items_in_result() {
        let mut builder = TestDataBuilder::default();

        // Duplicate the item at index 1.
        builder.sorted_padded_transformed_array.array[2] =
            builder.sorted_padded_transformed_array.array[1];

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn remove_result_item_counter() {
        let mut builder = TestDataBuilder::default();

        // Remove the counter of an item from the result.
        builder.sorted_padded_transformed_array.array[0].counter = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn missing_item_in_result() {
        let mut builder = TestDataBuilder::default();

        // Remove the first item from the result.
        builder.sorted_padded_transformed_array.array[0] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn remove_first_padded_item_from_result() {
        let mut builder = TestDataBuilder::default();

        // Remove the first padded item from the result.
        builder.sorted_padded_transformed_array.array[3] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value")]
    fn remove_last_padded_item_from_result() {
        let mut builder = TestDataBuilder::default();

        // Remove the last padded item from the result.
        builder.sorted_padded_transformed_array.array[4] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "Incorrect transformed value with index")]
    fn duplicate_padded_items_map_to_same_result_with_transform_i() {
        let mut builder = TestDataBuilder::new(
            [
                TestValue { value: 1, counter: 33 },
                TestValue { value: 2, counter: 22 },
                TestValue { value: 3, counter: MAX_U32_VALUE },
            ],
            [
                TestValue { value: 99, counter: MAX_U32_VALUE },
                TestValue { value: 3, counter: MAX_U32_VALUE },
            ],
        )
            .transform_i();

        builder.sorted_padded_transformed_array.array = pad_end([
            transform_i(TestValue { value: 2, counter: 22 }, 1),
            transform_i(TestValue { value: 1, counter: 33 }, 0),
            // Add a random item to the result.
            TestValue { value: 9999, counter: 44 },
            transform_i(TestValue { value: 99, counter: MAX_U32_VALUE }, 3),
            // This is for the duplicate item at index 4.
            transform_i(TestValue { value: 3, counter: MAX_U32_VALUE }, 4),
        ]);
        builder.sorted_padded_transformed_array.length = 5;

        // Map the original item with counter `MAX_U32_VALUE` to the padded item with the same value.
        builder.sorted_index_hints[2] = 4;

        builder.execute_with_hints();
    }

    // Uncomment this test if the function is allowed to be called again.
    // #[test(should_fail_with = "max counter value is reserved for padded items")]
    // fn use_duplicate_padded_items_to_add_random_item() {
    //     let mut builder = TestDataBuilder::new(
    //         [
    //             TestValue { value: 1, counter: 33 },
    //             TestValue { value: 2, counter: 22 },
    //             TestValue { value: 3, counter: MAX_U32_VALUE },
    //         ],
    //         [
    //             TestValue { value: 99, counter: MAX_U32_VALUE },
    //             TestValue { value: 3, counter: MAX_U32_VALUE },
    //         ],
    //     );

    //     builder.sorted_padded_transformed_array.array = pad_end([
    //         TestValue { value: 2, counter: 22 },
    //         TestValue { value: 1, counter: 33 },
    //         // Add a random item to the result.
    //         TestValue { value: 9999, counter: 44 },
    //         TestValue { value: 99, counter: MAX_U32_VALUE },
    //         TestValue { value: 3, counter: MAX_U32_VALUE },
    //     ]);
    //     builder.sorted_padded_transformed_array.length = 5;

    //     // Map the original item with counter `MAX_U32_VALUE` to the padded item with the same value.
    //     builder.sorted_index_hints[2] = 4;

    //     builder.execute_with_hints();
    // }

    #[test(should_fail_with = "Incorrect hinted number of padded items")]
    fn use_empty_items_within_claimed_length_to_add_random_item() {
        let mut builder = TestDataBuilder::new(
            [TestValue { value: 1, counter: 33 }, TestValue { value: 2, counter: 22 }],
            [],
        );

        // Increase the array length by 1 to include an empty item in the original array.
        builder.original_array.length += 1;

        builder.sorted_padded_transformed_array.array = pad_end([
            TestValue { value: 2, counter: 22 },
            TestValue { value: 1, counter: 33 },
            // Add a random item to the result.
            TestValue { value: 9999, counter: 44 },
        ]);
        builder.sorted_padded_transformed_array.length = 3;

        // Map the empty original item to a trailing item.
        builder.sorted_index_hints[2] = 6;

        builder.execute_with_hints();
    }

    #[test(should_fail_with = "Trailing items must have counter 0")]
    fn use_items_outside_of_capped_size_to_add_random_item() {
        let mut builder = TestDataBuilder::new(
            [TestValue { value: 1, counter: 33 }, TestValue { value: 2, counter: 22 }],
            [],
        );

        builder.sorted_padded_transformed_array.array = pad_end([
            TestValue { value: 2, counter: 22 },
            // Add a random item to the result.
            TestValue { value: 9999, counter: 99 },
        ]);
        builder.sorted_padded_transformed_array.length = 2;

        // Add the second transformed item outside of `CappedSize`.
        builder.sorted_padded_transformed_array.array[7] = TestValue { value: 1, counter: 33 };
        // Map the original item to the new index.
        builder.sorted_index_hints[0] = 7;

        builder.execute_with_hints();
    }

    #[test(should_fail_with = "CappedSize not large enough to cover all valid items in original_array")]
    fn capped_size_smaller_than_original_array_claimed_length() {
        let builder = TestDataBuilder::default();
        builder.execute_capped::<2>();
    }

    #[test]
    fn padded_items_beyond_capped_size_are_ignored() {
        let mut builder = TestDataBuilder::default();

        // The second padded item won't be included in the result.
        builder.sorted_padded_transformed_array.array[4] = TestValue::empty();

        // Update the result array length.
        builder.sorted_padded_transformed_array.length = 4;

        // Keep 3 original items and 1 padded item.
        builder.execute_capped::<4>();
    }

    #[test(should_fail_with = "Trailing items must have counter 0")]
    fn extra_non_empty_at_capped_size() {
        let mut builder = TestDataBuilder::default();

        // Add an item to the result at index `CappedSize`.
        builder.sorted_padded_transformed_array.array[5] = TestValue { value: 1, counter: 11 };

        builder.execute_capped::<5>();
    }

    #[test(should_fail_with = "Trailing items must have counter 0")]
    fn extra_non_empty_after_capped_size() {
        let mut builder = TestDataBuilder::default();

        // Add an item to the result at index `CappedSize` + 1.
        builder.sorted_padded_transformed_array.array[6] = TestValue { value: 1, counter: 11 };

        builder.execute_capped::<5>();
    }
}
