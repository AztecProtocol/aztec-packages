use crate::{abis::side_effect::Ordered, constants::MAX_U32_VALUE, traits::Empty};
use super::ClaimedLengthArray;

// This function ensures that the `sorted_transformed_padded_array` is sorted in ascending order by counter and that all
// transformations and padding are correctly applied.
// The expected structure of `sorted_transformed_padded_array` is:
// [...sorted_original_array, ...padded_items, ...empty_items]
//
// Argument requirements:
// - `original_array` must be valid, i.e. validate_array(original_array) == true
// - The items to be padded should start at index array_length(original_array) in `padded_items`.
// - Counters of the non-empty items in `original_array` must *not* be MAX_U32_VALUE, This is checked in this function.
// - Counters of the non-empty items in `padded_items` must be MAX_U32_VALUE. This is *not* checked in this function.
//
// original: [?, ?, ?, ?, ? | ?, ?, ?, ?, ? | ?, ?, ?]
// padded:   [0, 0, 0, 0, 0 | p, p, p, p, p | ?, ?, ?]
//                          ^               ^
//                          |               |
//                    original length       |
//                                          |
//                                     capped_size ???
//                                     I think it's the number of items to silo (i.e. all items)
//
// Notes:
// - Items in `padded_items` with index < array_length(original_array) and >= capped_size are ignored.
// - Any non-empty items after the first empty items in `padded_items` within the valid range will be added, but they
//   will not be included in blobs. Q: ???
// - `is_transformed` doesn't need to check the counters. This function makes sure that the item in
//   `sorted_transformed_padded_array` has the same counter as its corresponding item in `original_array` or `padded_items`.
pub fn assert_sorted_transformed_padded_array<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    padded_items: [T; N],
    sorted_transformed_padded_array: ClaimedLengthArray<S, N>,
    assert_transformed: fn[Env](T, S) -> (),
    sorted_indexes: [u32; N],
)
where
    T: Ordered + Empty,
    S: Ordered + Empty,
{
    assert_sorted_transformed_padded_array_capped_size(
        original_array,
        padded_items,
        sorted_transformed_padded_array,
        assert_transformed,
        sorted_indexes,
        N,
    );
}

// Same as assert_sorted_transformed_padded_array, but with an additional argument `capped_size`.
// `capped_size` should be a known constant at compile time and must be large enough to process all non-empty items in
// `original_array` and `padded_items`. Padding and transformation rules still apply.
pub fn assert_sorted_transformed_padded_array_capped_size<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>,
    padded_items: [T; N],
    output_array: ClaimedLengthArray<S, N>,
    assert_transformed: fn[Env](T, S) -> (),
    sorted_indexes: [u32; N],
    capped_size: u32,
)
where
    T: Ordered + Empty,
    S: Ordered + Empty,
{
    assert_sorted_transformed_i_padded_array_capped_size(
        original_array,
        padded_items,
        output_array,
        |prev, out, _i| assert_transformed(prev, out),
        sorted_indexes,
        capped_size,
    );
}

// Same as assert_sorted_transformed_padded_array_capped_size, but the callback is_transformed_i has an additional
// index argument.
// Useful for note hashes to use the index to compute the unique note hash.
//
// "Transformed" here, usually means: "assert siloed" or "assert siloed & unique-ified".
pub fn assert_sorted_transformed_i_padded_array_capped_size<T, S, let N: u32, Env>(
    original_array: ClaimedLengthArray<T, N>, // "kept" values (after squashing)
    padded_items: [T; N], // padding
    // Q: Why is this a different type S, instead of T?
    output_array: ClaimedLengthArray<S, N>, // output
    assert_transformed_i: fn[Env](T, S, u32) -> (),
    sorted_index_hints: [u32; N],
    capped_size: u32, // TODO: shouldn't we be looping over this, to reduce constraints?
)
where
    T: Ordered + Empty,
    S: Ordered + Empty,
{
    let original_array_length = original_array.length;

    // assert(original_array_length <= capped_size, "capped_size does not cover all non-empty items");
    // We need the padding_length, so instead of doing the above assertion, we do this:
    // This will fail if original_array_length > capped_size, because u32 cannot underflow.
    let padding_length = capped_size - original_array_length;

    let mut should_be_padded = false;
    for i in 0..N {
        let output_item = output_array.array[i];

        // TODO: might not need these empty assertions yet, given the new Arrays. Maybe wait until the Tail circuit?
        // Note: because capped_size is known at compile-time, Noir is clever enough
        // to only compute the `else` block `capped_size` number of times, instead of `N` times.
        // This is why we do sorting, siloing and padding in the reset circuit instead
        // of the tail: we can iterate over much smaller arrays in the reset, whereas
        // in the tail
        if i >= capped_size {
            // We've reached the end of the amount of padding we wanted to add.
            // Thereafter, all should be empty.
            output_item.assert_empty("array must be appended with empty items");
        } else {
            if i == original_array_length {
                should_be_padded = true;
            }

            let (from, to) = if should_be_padded {
                (padded_items[i], output_item)
            } else {
                // Q: where are we validating that these hints are correct?
                // What's stopping me from providing the same
                let sorted_index = sorted_index_hints[i];
                // Since we're iterating over `original_array.array[i]`, we cannot
                // avoid checking each item of the previous kernel's array, which is good:
                // it means the prover must copy all of the original array.
                // When we then `assert_transformed_i`, we're checking that this
                // item of the original array does indeed appear somewhere in the
                // output array.
                // That check doesn't necessarily guarantee that it
                // appears only _once_ in the output array.
                // And it doesn't necessarily guarantee that the item hasn't been
                // positioned in with all the padding, or even after the padding
                // in a position that should actually contain an empty item.
                //    Ok, for the latter, we assert that items after capped size must
                //    be empty.
                // So what are the consequences of one of these actual original note
                // hashes getting sorted into the padding? Perhaps they cannot be sorted
                // into padding, because we assert that their counter is not MAX_U32_VALUE below.
                // So to summarise: the sorted_index cannot be >= original_array_length, because:
                // - For every item >= original_array_length, we check next that
                //   its counter is MAX_U32_VALUE (or do we???)
                (original_array.array[i], output_array.array[sorted_index])
            };

            assert_transformed_i(from, to, i);

            assert_eq(from.counter(), to.counter(), "mapped item has mismatch counter");

            if !should_be_padded {
                // This prevents an array from being padded twice, which would allow a random item to be added to the
                // `output_array` by creating duplicated padded items.
                // For an example, see the test `assert_output_array__padded_twice_fails`.
                // Comment out this check and the test will fail because no error is raised.
                //
                // TODO: but in the case that it _is_ padding, are we asserting that from.counter _is_ MAX_U32_VALUE?
                assert(
                    from.counter() != MAX_U32_VALUE,
                    "max counter value is reserved for padded items",
                );

                // Assert sorted:
                if i != 0 {
                    assert(
                        output_item.counter() > output_array.array[i - 1].counter(),
                        "value array must be sorted by counter in ascending order",
                    );
                }
            }
        }
    }

    // TODO: reinstate once I can figure out how to make the Builder add padding that corresponds to the capped_size (when setting up tests)
    // E.g. noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/private_kernel_reset.nr:768:29
    // assert_eq(output_array.length, original_array.length + padding_length);
}

// A util to validate padded items, make sure that all are empty outside of the range [num_original_items, capped_size).
// And the non-empty items within the range are consecutive.
// They dont necessarily need to be empty outside of this range, those values will simply be ignored.
// But triggering an error if they are not can help avoiding any confusion or bugs where the array is not configured
// correctly by mistake.
// Maybe rename to `check_...`, because maybe we should adopt strict naming that `validate` always means "check something in a constrained way"?
pub unconstrained fn validate_padded_items<T, let N: u32>(
    padded_items: [T; N],
    num_original_items: u32,
    capped_size: u32,
)
where
    T: Empty,
{
    let mut seen_empty = false;
    for i in 0..N {
        let item_is_empty = padded_items[i].is_empty();
        if i < num_original_items | i >= capped_size {
            assert(
                item_is_empty,
                "padded items should be empty outside of the range [num_original_items, capped_size)",
            );
        } else {
            assert(
                item_is_empty | !seen_empty,
                "non-empty padded items should be consecutive within the range [num_original_items, capped_size)",
            );
            seen_empty |= item_is_empty;
        }
    }
}

mod tests {
    use crate::{
        constants::MAX_U32_VALUE,
        tests::{types::{TestTwoValues, TestValue}, utils::pad_end},
        traits::Empty,
        utils::arrays::{
            assert_sorted_transformed_padded_array::{
                assert_sorted_transformed_padded_array,
                assert_sorted_transformed_padded_array_capped_size, validate_padded_items,
            },
            ClaimedLengthArray,
        },
    };

    fn assert_summed_from_two_values(from: TestTwoValues, to: TestValue) -> () {
        assert_eq(from.value_1 + from.value_2, to.value, "Bad sum");
    }

    struct TestDataBuilder<let N: u32> {
        original_array: ClaimedLengthArray<TestTwoValues, N>,
        padded_items: [TestTwoValues; N],
        sorted_transformed_padded_array: ClaimedLengthArray<TestValue, N>,
        sorted_indexes: [u32; N],
        padded_start_index: u32,
    }

    impl TestDataBuilder<8> {
        pub fn new() -> Self {
            let original_array = ClaimedLengthArray {
                array: [
                    TestTwoValues { value_1: 10, value_2: 5, counter: 44 },
                    TestTwoValues { value_1: 20, value_2: 6, counter: 22 },
                    TestTwoValues { value_1: 30, value_2: 7, counter: 11 },
                    TestTwoValues::empty(),
                    TestTwoValues::empty(),
                    TestTwoValues::empty(),
                    TestTwoValues::empty(),
                    TestTwoValues::empty(),
                ],
                length: 3,
            };

            let padded_items = [
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues { value_1: 987, value_2: 3, counter: MAX_U32_VALUE },
                TestTwoValues { value_1: 654, value_2: 6, counter: MAX_U32_VALUE },
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
            ];

            let sorted_transformed_padded_array = ClaimedLengthArray {
                array: [
                    TestValue { value: 37, counter: 11 },
                    TestValue { value: 26, counter: 22 },
                    TestValue { value: 15, counter: 44 },
                    TestValue { value: 990, counter: MAX_U32_VALUE },
                    TestValue { value: 660, counter: MAX_U32_VALUE },
                    TestValue::empty(),
                    TestValue::empty(),
                    TestValue::empty(),
                ],
                length: 5,
            };

            let sorted_indexes = [2, 1, 0, 3, 4, 5, 6, 7];

            TestDataBuilder {
                original_array,
                padded_items,
                sorted_transformed_padded_array,
                sorted_indexes,
                padded_start_index: 3,
            }
        }

        pub fn without_padding(&mut self) -> Self {
            self.padded_items = [TestTwoValues::empty(); 8];

            self.sorted_transformed_padded_array.array[self.padded_start_index] =
                TestValue::empty();
            self.sorted_transformed_padded_array.array[self.padded_start_index + 1] =
                TestValue::empty();

            self.sorted_transformed_padded_array.length -= 2;

            *self
        }

        pub fn without_original(&mut self) -> Self {
            self.original_array = ClaimedLengthArray::<TestTwoValues, 8>::empty();
            self.original_array.length = 0;

            let prev = self.padded_items;
            self.padded_items = pad_end([prev[3], prev[4]], TestTwoValues::empty());

            let prev = self.sorted_transformed_padded_array.array;
            self.sorted_transformed_padded_array.array =
                pad_end([prev[3], prev[4]], TestValue::empty());
            self.sorted_transformed_padded_array.length = 2;

            self.sorted_indexes = [0, 1, 2, 3, 4, 5, 6, 7];

            self.padded_start_index = 0;

            *self
        }

        pub fn execute(self) {
            assert_sorted_transformed_padded_array(
                self.original_array,
                self.padded_items,
                self.sorted_transformed_padded_array,
                assert_summed_from_two_values,
                self.sorted_indexes,
            );
        }

        pub fn execute_capped(self, capped_size: u32) {
            assert_sorted_transformed_padded_array_capped_size(
                self.original_array,
                self.padded_items,
                self.sorted_transformed_padded_array,
                assert_summed_from_two_values,
                self.sorted_indexes,
                capped_size,
            );
        }
    }

    #[test]
    fn assert_sorted_transformed_padded_array__succeeds() {
        let builder = TestDataBuilder::new();
        builder.execute();
    }

    #[test]
    fn assert_sorted_transformed_padded_array__without_original_succeeds() {
        let builder = TestDataBuilder::new().without_original();
        builder.execute();
    }

    #[test]
    fn assert_sorted_transformed_padded_array__without_padding_succeeds() {
        let builder = TestDataBuilder::new();
        builder.execute();
    }

    #[test]
    fn assert_sorted_transformed_padded_array__without_original_and_padding_succeeds() {
        let builder = TestDataBuilder::new().without_padding().without_original();
        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__mismatch_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Tweak the value at index 1.
        builder.sorted_transformed_padded_array.array[1].value += 1;

        builder.execute();
    }

    #[test(should_fail_with = "value array must be sorted by counter in ascending order")]
    fn assert_sorted_transformed_padded_array__unordered_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 1 and 2.
        let tmp = builder.sorted_transformed_padded_array.array[1];
        builder.sorted_transformed_padded_array.array[1] =
            builder.sorted_transformed_padded_array.array[2];
        builder.sorted_transformed_padded_array.array[2] = tmp;

        // Update sorted indexes.
        // Original: 44, 22, 11
        // Tweaked result: 11, 44, 22
        builder.sorted_indexes[0] = 1;
        builder.sorted_indexes[1] = 2;
        builder.sorted_indexes[2] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__extra_non_empty_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Set value to an empty item.
        builder.sorted_transformed_padded_array.array[5].value = 1;

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__extra_non_empty_counter_fails() {
        let mut builder = TestDataBuilder::new();

        // Set counter to an empty item.
        builder.sorted_transformed_padded_array.array[5].counter = MAX_U32_VALUE;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__duplicated_fails() {
        let mut builder = TestDataBuilder::new();

        // Add a duplicated item.
        builder.sorted_transformed_padded_array.array[5] =
            builder.sorted_transformed_padded_array.array[4];

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__hint_to_duplicated_fails() {
        let mut builder = TestDataBuilder::new();

        // Add a duplicated item.
        builder.sorted_transformed_padded_array.array[5] =
            builder.sorted_transformed_padded_array.array[4];
        // Change the hint to point to the new item.
        builder.sorted_indexes[4] = 5;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__remove_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the first item from the result.
        builder.sorted_transformed_padded_array.array[0] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__remove_item_counter_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the counter of an item from the result.
        builder.sorted_transformed_padded_array.array[0].counter = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__remove_item_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the value of an item from the result.
        builder.sorted_transformed_padded_array.array[0].value = 0;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__swap_values_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values of the first and second items in the result.
        let tmp = builder.sorted_transformed_padded_array.array[0].value;
        builder.sorted_transformed_padded_array.array[0].value =
            builder.sorted_transformed_padded_array.array[1].value;
        builder.sorted_transformed_padded_array.array[1].value = tmp;

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__swap_values_and_indexes_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values of the first and second items in the result.
        let tmp = builder.sorted_transformed_padded_array.array[0].value;
        builder.sorted_transformed_padded_array.array[0].value =
            builder.sorted_transformed_padded_array.array[1].value;
        builder.sorted_transformed_padded_array.array[1].value = tmp;

        // Update the indexes to point to the new items.
        builder.sorted_indexes[1] = 0;
        builder.sorted_indexes[2] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__remove_first_padded_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the first padded item from the result.
        builder.sorted_transformed_padded_array.array[3] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "Bad sum")]
    fn assert_sorted_transformed_padded_array__remove_last_padded_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the last padded item from the result.
        builder.sorted_transformed_padded_array.array[4] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "max counter value is reserved for padded items")]
    fn assert_sorted_transformed_padded_array__max_counter_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Make sure we are changing the same item.
        assert(
            builder.original_array.array[0].counter
                == builder.sorted_transformed_padded_array.array[2].counter,
        );
        // Set the counter of the item to MAX_U32_VALUE.
        builder.original_array.array[0].counter = MAX_U32_VALUE;
        builder.sorted_transformed_padded_array.array[2].counter = MAX_U32_VALUE;

        builder.execute();
    }

    #[test(should_fail_with = "max counter value is reserved for padded items")]
    fn assert_sorted_transformed_padded_array__padded_twice_fails() {
        let mut builder = TestDataBuilder::new();

        builder.original_array.array = pad_end(
            [
                TestTwoValues { value_1: 10, value_2: 5, counter: 44 },
                TestTwoValues { value_1: 20, value_2: 6, counter: 22 },
                // Add a padded item to the original array.
                TestTwoValues { value_1: 987, value_2: 3, counter: MAX_U32_VALUE },
            ],
            TestTwoValues::empty(),
        );
        builder.original_array.length += 3;

        builder.padded_items = pad_end(
            [
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                // Add a duplicated padded item to the padded items.
                TestTwoValues { value_1: 987, value_2: 3, counter: MAX_U32_VALUE },
            ],
            TestTwoValues::empty(),
        );

        builder.sorted_transformed_padded_array.array = pad_end(
            [
                TestValue { value: 26, counter: 22 },
                // Add a random item to the result.
                TestValue { value: 10101, counter: 33 },
                TestValue { value: 15, counter: 44 },
                TestValue { value: 990, counter: MAX_U32_VALUE },
            ],
            TestValue::empty(),
        );
        builder.sorted_transformed_padded_array.length += 4;

        // Map the padded item in the original array to the new padded item: sorted_index[2] = 3
        builder.sorted_indexes = [2, 0, 3, 3, 4, 5, 6, 7];

        builder.execute();
    }

    ///////////////////////////////
    // With capped size.
    ///////////////////////////////

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__succeeds() {
        let builder = TestDataBuilder::new();
        builder.execute_capped(6);
    }

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__without_original_succeeds() {
        let builder = TestDataBuilder::new().without_original();
        builder.execute_capped(6);
    }

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__without_padding_succeeds() {
        let builder = TestDataBuilder::new().without_padding();
        builder.execute_capped(6);
    }

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__without_original_and_padding_succeeds() {
        let builder = TestDataBuilder::new().without_original().without_padding();
        builder.execute_capped(6);
    }

    // #[test(should_fail_with = "capped_size does not cover all non-empty items")]
    #[test(should_fail_with = "attempt to subtract with overflow")]
    fn assert_sorted_transformed_padded_array_capped_size__chopped_original_fails() {
        let builder = TestDataBuilder::new();
        builder.execute_capped(2);
    }

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__chopped_padded_items_succeeds() {
        let mut builder = TestDataBuilder::new();

        // The second padded item won't be included in the result.
        builder.sorted_transformed_padded_array.array[4] = TestValue::empty();

        // Keep 3 original items and 1 padded item.
        builder.execute_capped(4);
    }

    #[test(should_fail_with = "array must be appended with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_at_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item outside of capped_size to the result at index capped_size.
        builder.sorted_transformed_padded_array.array[5].value = 1;

        builder.execute_capped(5);
    }

    #[test(should_fail_with = "array must be appended with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_after_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item outside of capped_size to the result at index capped_size + 1.
        builder.sorted_transformed_padded_array.array[6].value = 1;

        builder.execute_capped(5);
    }

    #[test(should_fail_with = "array must be appended with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_counter_after_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Set the counter of an item outside of capped_size to MAX_U32_VALUE.
        builder.sorted_transformed_padded_array.array[6].counter = MAX_U32_VALUE;

        builder.execute_capped(5);
    }

    ///////////////////////////////
    // validate_padded_items
    ///////////////////////////////

    struct PaddedItemsBuilder {
        padded_items: [u32; 8],
        num_original_items: u32,
        capped_size: u32,
    }

    impl PaddedItemsBuilder {
        pub fn new() -> Self {
            PaddedItemsBuilder {
                padded_items: [0, 0, 11, 22, 33, 0, 0, 0],
                num_original_items: 2,
                capped_size: 5,
            }
        }

        pub fn execute(self) {
            // Safety: `validate_padded_items` is supposed to be called only in unconstrained functions.
            unsafe {
                validate_padded_items(self.padded_items, self.num_original_items, self.capped_size);
            }
        }
    }

    #[test]
    fn validate_padded_items__succeeds() {
        let mut builder = PaddedItemsBuilder::new();

        builder.execute();

        builder.capped_size = 6;
        builder.execute();

        builder.capped_size = 7;
        builder.execute();

        builder.capped_size = 8;
        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn validate_padded_items__non_empty_before_range_fails() {
        let mut builder = PaddedItemsBuilder::new();

        builder.padded_items[0] = 99;

        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn validate_padded_items__capped_size_too_small_fails() {
        let mut builder = PaddedItemsBuilder::new();

        builder.capped_size = 4;

        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn validate_padded_items__non_empty_after_range_fails() {
        let mut builder = PaddedItemsBuilder::new();

        builder.padded_items[6] = 99;

        builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn validate_padded_items__empty_first_in_range_fails() {
        let mut builder = PaddedItemsBuilder::new();

        builder.padded_items[2] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn validate_padded_items__empty_middle_in_range_fails() {
        let mut builder = PaddedItemsBuilder::new();

        builder.padded_items[3] = 0;

        builder.execute();
    }
}
