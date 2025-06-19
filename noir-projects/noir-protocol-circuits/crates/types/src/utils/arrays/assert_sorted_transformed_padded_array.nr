use crate::{
    abis::side_effect::Ordered,
    constants::MAX_U32_VALUE,
    traits::{Empty, is_empty},
    utils::arrays::array_length,
};

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
// Notes:
// - Items in `padded_items` with index < array_length(original_array) and >= capped_size are ignored.
// - Any non-empty items after the first empty items in `padded_items` within the valid range will be added, but they
//   will not be included in blobs.
// - `is_transformed` doesn't need to check the counters. This function makes sure that the item in
//   `sorted_transformed_padded_array` has the same counter as its corresponding item in `original_array` or `padded_items`.
pub fn assert_sorted_transformed_padded_array<T, S, let N: u32, Env>(
    original_array: [T; N],
    padded_items: [T; N],
    sorted_transformed_padded_array: [S; N],
    is_transformed: fn[Env](T, S) -> bool,
    sorted_indexes: [u32; N],
)
where
    T: Ordered + Eq + Empty,
    S: Ordered + Eq + Empty,
{
    assert_sorted_transformed_padded_array_capped_size(
        original_array,
        padded_items,
        sorted_transformed_padded_array,
        is_transformed,
        sorted_indexes,
        N,
    );
}

// Same as assert_sorted_transformed_padded_array, but with an additional argument `capped_size`.
// `capped_size` should be a known constant at compile time and must be large enough to process all non-empty items in
// `original_array` and `padded_items`. Padding and transformation rules still apply.
pub fn assert_sorted_transformed_padded_array_capped_size<T, S, let N: u32, Env>(
    original_array: [T; N],
    padded_items: [T; N],
    sorted_transformed_padded_array: [S; N],
    is_transformed: fn[Env](T, S) -> bool,
    sorted_indexes: [u32; N],
    capped_size: u32,
)
where
    T: Ordered + Eq + Empty,
    S: Ordered + Eq + Empty,
{
    assert_sorted_transformed_i_padded_array_capped_size(
        original_array,
        padded_items,
        sorted_transformed_padded_array,
        |prev, out, _i| is_transformed(prev, out),
        sorted_indexes,
        capped_size,
    );
}

// Same as assert_sorted_transformed_padded_array_capped_size, but the callback is_transformed_i has an additional
// index argument.
// Useful for note hashes to use the index to compute the unique note hash.
pub fn assert_sorted_transformed_i_padded_array_capped_size<T, S, let N: u32, Env>(
    original_array: [T; N],
    padded_items: [T; N],
    sorted_transformed_padded_array: [S; N],
    is_transformed_i: fn[Env](T, S, u32) -> bool,
    sorted_indexes: [u32; N],
    capped_size: u32,
)
where
    T: Ordered + Eq + Empty,
    S: Ordered + Eq + Empty,
{
    let num_non_empty_items = array_length(original_array);
    assert(num_non_empty_items <= capped_size, "capped_size does not cover all non-empty items");

    let mut should_be_padded = false;
    for i in 0..N {
        let mapped = sorted_transformed_padded_array[i];
        if i >= capped_size {
            assert(is_empty(mapped), "array must be padded with empty items");
        } else {
            should_be_padded |= i == num_non_empty_items;
            let original = original_array[i];
            let padded = padded_items[i];
            let sorted_index = sorted_indexes[i];
            let (from, to) = if should_be_padded {
                (padded, mapped)
            } else {
                (original, sorted_transformed_padded_array[sorted_index])
            };

            assert(is_transformed_i(from, to, i), "incorrect transformed value");
            assert(from.counter() == to.counter(), "mapped item has mismatch counter");

            if !should_be_padded {
                // This prevent an array from being padded twice, which will allow a random item to be added to the
                // `sorted_transformed_padded_array` by creating duplicated padded items.
                // For an example, see the test `assert_sorted_transformed_padded_array__padded_twice_fails`.
                // Comment out this check and the test will fail because no error is raised.
                assert(
                    from.counter() != MAX_U32_VALUE,
                    "max counter value is reserved for padded items",
                );

                if i != 0 {
                    assert(
                        mapped.counter() > sorted_transformed_padded_array[i - 1].counter(),
                        "value array must be sorted by counter in ascending order",
                    );
                }
            }
        }
    }
}

// A util to validate padded items, make sure that all are empty outside of the range [num_original_items, capped_size).
// And the non-empty items within the range are consecutive.
// They dont necessarily need to be empty outside of this range, those values will simply be ignored.
// But triggering an error if they are not can help avoiding any confusion or bugs where the array is not configured
// correctly by mistake.
pub unconstrained fn validate_padded_items<T, let N: u32>(
    padded_items: [T; N],
    num_original_items: u32,
    capped_size: u32,
)
where
    T: Eq + Empty,
{
    let mut seen_empty = false;
    for i in 0..N {
        let item_is_empty = is_empty(padded_items[i]);
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
        utils::arrays::assert_sorted_transformed_padded_array::{
            assert_sorted_transformed_padded_array,
            assert_sorted_transformed_padded_array_capped_size, validate_padded_items,
        },
    };

    fn is_summed_from_two_values(from: TestTwoValues, to: TestValue) -> bool {
        ((from.value_1 + from.value_2) == to.value)
    }

    struct TestDataBuilder<let N: u32> {
        original_array: [TestTwoValues; N],
        padded_items: [TestTwoValues; N],
        sorted_transformed_padded_array: [TestValue; N],
        sorted_indexes: [u32; N],
        padded_start_index: u32,
    }

    impl TestDataBuilder<8> {
        pub fn new() -> Self {
            let original_array = [
                TestTwoValues { value_1: 10, value_2: 5, counter: 44 },
                TestTwoValues { value_1: 20, value_2: 6, counter: 22 },
                TestTwoValues { value_1: 30, value_2: 7, counter: 11 },
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
                TestTwoValues::empty(),
            ];

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

            let sorted_transformed_padded_array = [
                TestValue { value: 37, counter: 11 },
                TestValue { value: 26, counter: 22 },
                TestValue { value: 15, counter: 44 },
                TestValue { value: 990, counter: MAX_U32_VALUE },
                TestValue { value: 660, counter: MAX_U32_VALUE },
                TestValue::empty(),
                TestValue::empty(),
                TestValue::empty(),
            ];

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

            self.sorted_transformed_padded_array[self.padded_start_index] = TestValue::empty();
            self.sorted_transformed_padded_array[self.padded_start_index + 1] = TestValue::empty();

            *self
        }

        pub fn without_original(&mut self) -> Self {
            self.original_array = [TestTwoValues::empty(); 8];

            let prev = self.padded_items;
            self.padded_items = pad_end([prev[3], prev[4]], TestTwoValues::empty());

            let prev = self.sorted_transformed_padded_array;
            self.sorted_transformed_padded_array = pad_end([prev[3], prev[4]], TestValue::empty());

            self.sorted_indexes = [0, 1, 2, 3, 4, 5, 6, 7];

            self.padded_start_index = 0;

            *self
        }

        pub fn execute(self) {
            assert_sorted_transformed_padded_array(
                self.original_array,
                self.padded_items,
                self.sorted_transformed_padded_array,
                is_summed_from_two_values,
                self.sorted_indexes,
            );
        }

        pub fn execute_capped(self, capped_size: u32) {
            assert_sorted_transformed_padded_array_capped_size(
                self.original_array,
                self.padded_items,
                self.sorted_transformed_padded_array,
                is_summed_from_two_values,
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

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__mismatch_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Tweak the value at index 1.
        builder.sorted_transformed_padded_array[1].value += 1;

        builder.execute();
    }

    #[test(should_fail_with = "value array must be sorted by counter in ascending order")]
    fn assert_sorted_transformed_padded_array__unordered_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 1 and 2.
        let tmp = builder.sorted_transformed_padded_array[1];
        builder.sorted_transformed_padded_array[1] = builder.sorted_transformed_padded_array[2];
        builder.sorted_transformed_padded_array[2] = tmp;

        // Update sorted indexes.
        // Original: 44, 22, 11
        // Tweaked result: 11, 44, 22
        builder.sorted_indexes[0] = 1;
        builder.sorted_indexes[1] = 2;
        builder.sorted_indexes[2] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__extra_non_empty_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Set value to an empty item.
        builder.sorted_transformed_padded_array[5].value = 1;

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__extra_non_empty_counter_fails() {
        let mut builder = TestDataBuilder::new();

        // Set counter to an empty item.
        builder.sorted_transformed_padded_array[5].counter = MAX_U32_VALUE;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__duplicated_fails() {
        let mut builder = TestDataBuilder::new();

        // Add a duplicated item.
        builder.sorted_transformed_padded_array[5] = builder.sorted_transformed_padded_array[4];

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__hint_to_duplicated_fails() {
        let mut builder = TestDataBuilder::new();

        // Add a duplicated item.
        builder.sorted_transformed_padded_array[5] = builder.sorted_transformed_padded_array[4];
        // Change the hint to point to the new item.
        builder.sorted_indexes[4] = 5;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__remove_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the first item from the result.
        builder.sorted_transformed_padded_array[0] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__remove_item_counter_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the counter of an item from the result.
        builder.sorted_transformed_padded_array[0].counter = 0;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__remove_item_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the value of an item from the result.
        builder.sorted_transformed_padded_array[0].value = 0;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__swap_values_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values of the first and second items in the result.
        let tmp = builder.sorted_transformed_padded_array[0].value;
        builder.sorted_transformed_padded_array[0].value =
            builder.sorted_transformed_padded_array[1].value;
        builder.sorted_transformed_padded_array[1].value = tmp;

        builder.execute();
    }

    #[test(should_fail_with = "mapped item has mismatch counter")]
    fn assert_sorted_transformed_padded_array__swap_values_and_indexes_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values of the first and second items in the result.
        let tmp = builder.sorted_transformed_padded_array[0].value;
        builder.sorted_transformed_padded_array[0].value =
            builder.sorted_transformed_padded_array[1].value;
        builder.sorted_transformed_padded_array[1].value = tmp;

        // Update the indexes to point to the new items.
        builder.sorted_indexes[1] = 0;
        builder.sorted_indexes[2] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__remove_first_padded_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the first padded item from the result.
        builder.sorted_transformed_padded_array[3] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "incorrect transformed value")]
    fn assert_sorted_transformed_padded_array__remove_last_padded_item_fails() {
        let mut builder = TestDataBuilder::new();

        // Remove the last padded item from the result.
        builder.sorted_transformed_padded_array[4] = TestValue::empty();

        builder.execute();
    }

    #[test(should_fail_with = "max counter value is reserved for padded items")]
    fn assert_sorted_transformed_padded_array__max_counter_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Make sure we are changing the same item.
        assert(
            builder.original_array[0].counter == builder.sorted_transformed_padded_array[2].counter,
        );
        // Set the counter of the item to MAX_U32_VALUE.
        builder.original_array[0].counter = MAX_U32_VALUE;
        builder.sorted_transformed_padded_array[2].counter = MAX_U32_VALUE;

        builder.execute();
    }

    #[test(should_fail_with = "max counter value is reserved for padded items")]
    fn assert_sorted_transformed_padded_array__padded_twice_fails() {
        let mut builder = TestDataBuilder::new();

        builder.original_array = pad_end(
            [
                TestTwoValues { value_1: 10, value_2: 5, counter: 44 },
                TestTwoValues { value_1: 20, value_2: 6, counter: 22 },
                // Add a padded item to the original array.
                TestTwoValues { value_1: 987, value_2: 3, counter: MAX_U32_VALUE },
            ],
            TestTwoValues::empty(),
        );

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

        builder.sorted_transformed_padded_array = pad_end(
            [
                TestValue { value: 26, counter: 22 },
                // Add a random item to the result.
                TestValue { value: 10101, counter: 33 },
                TestValue { value: 15, counter: 44 },
                TestValue { value: 990, counter: MAX_U32_VALUE },
            ],
            TestValue::empty(),
        );

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

    #[test(should_fail_with = "capped_size does not cover all non-empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__chopped_original_fails() {
        let builder = TestDataBuilder::new();
        builder.execute_capped(2);
    }

    #[test]
    fn assert_sorted_transformed_padded_array_capped_size__chopped_padded_items_succeeds() {
        let mut builder = TestDataBuilder::new();

        // The second padded item won't be included in the result.
        builder.sorted_transformed_padded_array[4] = TestValue::empty();

        // Keep 3 original items and 1 padded item.
        builder.execute_capped(4);
    }

    #[test(should_fail_with = "array must be padded with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_at_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item outside of capped_size to the result at index capped_size.
        builder.sorted_transformed_padded_array[5].value = 1;

        builder.execute_capped(5);
    }

    #[test(should_fail_with = "array must be padded with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_after_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item outside of capped_size to the result at index capped_size + 1.
        builder.sorted_transformed_padded_array[6].value = 1;

        builder.execute_capped(5);
    }

    #[test(should_fail_with = "array must be padded with empty items")]
    fn assert_sorted_transformed_padded_array_capped_size__extra_non_empty_counter_after_capped_size_fails() {
        let mut builder = TestDataBuilder::new();

        // Set the counter of an item outside of capped_size to MAX_U32_VALUE.
        builder.sorted_transformed_padded_array[6].counter = MAX_U32_VALUE;

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
