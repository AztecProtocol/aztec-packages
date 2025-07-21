use crate::{
    abis::side_effect::Ordered, constants::MAX_U32_VALUE, traits::Empty,
    utils::arrays::find_index_hint,
};

pub(crate) fn assert_split_transformed_padded_arrays_with_hint<T, S, let N: u32, Env>(
    sorted_array: [T; N],
    transformed_value_array_lt: [S; N], // Values whose counters are less than the split counter.
    transformed_value_array_gte: [S; N], // Values whose counters are greater than or equal to the split counter.
    assert_transformed: fn[Env](T, S) -> (),
    split_counter: u32,
    // The following hints should be checked in this function.
    num_padded_lt: u32,
    first_after_split_index: Option<u32>,
    first_padded_index: Option<u32>,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // --- Validate the hints ---

    // TODO: refactor this function so that `N` isn't treated as nullish.
    // For now, I'm just doing this do that I don't have to do it yet.
    let first_after_split_index = if first_after_split_index.is_none() {
        N
    } else {
        first_after_split_index.unwrap_unchecked()
    };

    let first_padded_index = if first_padded_index.is_none() {
        N
    } else {
        first_padded_index.unwrap_unchecked()
    };

    // --- Validate the hints ---

    // Validate first_after_split_index:
    // sorted_array[first_after_split_index - 1].counter() < split_counter <= sorted_array[first_after_split_index].counter()
    if first_after_split_index != 0 {
        assert(
            sorted_array[first_after_split_index - 1].counter() < split_counter,
            "first_after_split_index is too large",
        );
    }
    if first_after_split_index != N {
        let counter = sorted_array[first_after_split_index].counter();
        // Note: A padded item can also be the first item after the split counter.
        assert((counter == 0) | (counter >= split_counter), "incorrect first_after_split_index");
    }

    // Validate first_padded_index:
    // sorted_array[first_padded_index - 1].counter() is not nullish, but sorted_array[first_padded_index].counter() is nullish.
    // Q: where do we validate that all counters earlier are also not nullish,
    // and that all counters later are also nullish?
    if first_padded_index != 0 {
        assert(
            sorted_array[first_padded_index - 1].counter() != MAX_U32_VALUE,
            "first_padded_index is too large",
        );
    }
    if first_padded_index != N {
        assert(
            sorted_array[first_padded_index].counter() == MAX_U32_VALUE,
            "incorrect first_padded_index",
        );
    }

    // Validate num_padded_lt/first_padded_gte_index
    let first_padded_gte_index = first_padded_index + num_padded_lt;
    if first_padded_gte_index != N {
        // If num_padded_lt is too large and there isn't enough padded items,
        // first_padded_gte_index will be > N and the following will fail because the index is out of bounds.
        let counter = sorted_array[first_padded_gte_index].counter();
        // If there's no padded items for gte, the index will point to an empty item. And we can treat them as regular
        // items and "pad" them to the gte array.
        assert((counter == 0) | (counter == MAX_U32_VALUE), "incorrect first_padded_gte_index");
    }

    // --- Initialize state tracking for the iteration ---
    //
    // TODO: this section is difficult to understand.
    //
    // There are 4 phases in the iteration:
    // 1. Processing items that belong to the `_lt` array and are not padded: `non_padded_lt`
    // 2. Processing items that belong to the `_lt` array and are padded: `padded_lt`
    // 3. Processing items that belong to the `_gte` array and are not padded: `non_padded_gte`
    // 4. Processing items that belong to the `_gte` array and are padded: `padded_gte`
    //
    // Note that the empty items padded to the `sorted_array` will be processed in:
    // - Phase 2 if there are no padded items for the `_gte` array: first_padded_gte_index == N
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
    //
    // [ _, _, _, 0| 0, 0, 0, 0]
    //   ^        ^
    //   1        2
    // [ _, _, _, _| _, 0, 0, 0]
    //               ^  ^
    //               3  4
    let mut is_lt = true;
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
        is_lt = is_non_padded_lt | (is_padded & !is_padded_gte);

        // Check that an item is copied and transformed correctly from `sorted_array` to the destination array.
        // From:
        // sorted_array: [...Phase_1, ...Phase_2, ...Phase_3, ...Phase_4]
        // To:
        // _lt: [...Phase_1, ...Phase_2, ...empty_items]
        // _gte: [...Phase_3, ...Phase_4, ...empty_items]
        let from = sorted_array[i];
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
        let to = if is_lt {
            transformed_value_array_lt[to_index]
        } else {
            transformed_value_array_gte[to_index]
        };
        // Assert the value is transformed correctly.
        assert_transformed(from, to);

        // For every item added to the lt array, there is an empty item padded to the gte array. And vice versa.
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
            transformed_value_array_gte[empty_index]
        } else {
            transformed_value_array_lt[empty_index]
        };
        // Assert an empty item is padded.
        assert(padded_empty.is_empty(), "array should be padded with empty items");
    }
}

// Validates that the `sorted_array` has been split and transformed correctly into two separate arrays:
// - `transformed_value_array_lt`: for items with counters `< split_counter`, followed by `num_padded_lt` padded items.
// - `transformed_value_array_gte`: for items with counters `>= split_counter`, followed by the rest of the padded items.
//
// Both result arrays must be padded with empty items to preserve length `N`.
pub fn assert_split_transformed_padded_arrays<T, S, let N: u32, Env>(
    sorted_array: [T; N],
    transformed_value_array_lt: [S; N], // Values whose counters are less than the split counter.
    transformed_value_array_gte: [S; N], // Values whose counters are greater than or equal to the split counter.
    assert_transformed: fn[Env](T, S) -> (),
    split_counter: u32,
    // The following is provided as a hint and should be checked.
    num_padded_lt: u32,
)
where
    T: Ordered + Empty,
    S: Empty,
{
    // Safety: The hints are constrained by `assert_split_transformed_padded_arrays_with_hint`.
    let (first_after_split_index, first_padded_index) = unsafe {
        (
            find_index_hint(sorted_array, |n: T| n.counter() >= split_counter),
            find_index_hint(sorted_array, |n: T| n.counter() == MAX_U32_VALUE),
        )
    };

    assert_split_transformed_padded_arrays_with_hint(
        sorted_array,
        transformed_value_array_lt,
        transformed_value_array_gte,
        assert_transformed,
        split_counter,
        num_padded_lt,
        first_after_split_index,
        first_padded_index,
    );
}

mod tests {
    use crate::{
        constants::MAX_U32_VALUE,
        tests::{types::TestValue, utils::pad_end},
        traits::Empty,
        utils::arrays::assert_split_transformed_padded_arrays::{
            assert_split_transformed_padded_arrays,
            assert_split_transformed_padded_arrays_with_hint,
        },
    };

    global NUM_TEST_ITEMS: u32 = 8;

    fn assert_transformed(from: TestValue, to: Field) -> () {
        assert_eq(from.value, to, "invalid transformed value");
    }

    struct TestBuilder {
        sorted_array: [TestValue; NUM_TEST_ITEMS],
        transformed_value_array_lt: [Field; NUM_TEST_ITEMS],
        transformed_value_array_gte: [Field; NUM_TEST_ITEMS],
        split_counter: u32,
        num_padded_lt: u32,
        first_after_split_index: Option<u32>,
        first_padded_index: Option<u32>,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let sorted_array = pad_end(
                [
                    TestValue { value: 40, counter: 3 },
                    TestValue { value: 30, counter: 7 },
                    TestValue { value: 80, counter: 13 },
                    TestValue { value: 20, counter: MAX_U32_VALUE },
                    TestValue { value: 50, counter: MAX_U32_VALUE },
                    TestValue { value: 10, counter: MAX_U32_VALUE },
                ],
                TestValue::empty(),
            );

            let transformed_value_array_lt = pad_end([40, 30, 20], 0);

            let transformed_value_array_gte = pad_end([80, 50, 10], 0);

            TestBuilder {
                sorted_array,
                transformed_value_array_lt,
                transformed_value_array_gte,
                split_counter: 12,
                num_padded_lt: 1,
                first_after_split_index: Option::some(2),
                first_padded_index: Option::some(3),
            }
        }

        pub fn new_without_padded() -> Self {
            let sorted_array = pad_end(
                [
                    TestValue { value: 40, counter: 3 },
                    TestValue { value: 30, counter: 7 },
                    TestValue { value: 80, counter: 13 },
                ],
                TestValue::empty(),
            );

            let transformed_value_array_lt = pad_end([40, 30], 0);

            let transformed_value_array_gte = pad_end([80], 0);

            TestBuilder {
                sorted_array,
                transformed_value_array_lt,
                transformed_value_array_gte,
                split_counter: 12,
                num_padded_lt: 0,
                first_after_split_index: Option::some(2),
                first_padded_index: Option::some(NUM_TEST_ITEMS),
            }
        }

        pub fn new_empty() -> Self {
            TestBuilder {
                sorted_array: [TestValue::empty(); NUM_TEST_ITEMS],
                transformed_value_array_lt: [0; NUM_TEST_ITEMS],
                transformed_value_array_gte: [0; NUM_TEST_ITEMS],
                split_counter: 12,
                num_padded_lt: 0,
                first_after_split_index: Option::some(0),
                first_padded_index: Option::some(0),
            }
        }

        pub fn execute(self) {
            assert_split_transformed_padded_arrays(
                self.sorted_array,
                self.transformed_value_array_lt,
                self.transformed_value_array_gte,
                assert_transformed,
                self.split_counter,
                self.num_padded_lt,
            );
        }

        pub fn execute_with_hint(self) {
            assert_split_transformed_padded_arrays_with_hint(
                self.sorted_array,
                self.transformed_value_array_lt,
                self.transformed_value_array_gte,
                assert_transformed,
                self.split_counter,
                self.num_padded_lt,
                self.first_after_split_index,
                self.first_padded_index,
            );
        }
    }

    #[test]
    fn assert_split_transformed_padded_arrays__succeeds() {
        let builder = TestBuilder::new();
        builder.execute();
    }

    #[test]
    fn assert_split_transformed_padded_arrays__empty_non_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        // Make everything revertible.
        builder.split_counter = 1;

        builder.transformed_value_array_lt = pad_end([20], 0);
        builder.transformed_value_array_gte = pad_end([40, 30, 80, 50, 10], 0);

        builder.execute();
    }

    #[test]
    fn assert_split_transformed_padded_arrays__empty_revertible_succeeds() {
        let mut builder = TestBuilder::new();

        // Make everything non-revertible.
        builder.split_counter = 99;

        builder.transformed_value_array_lt = pad_end([40, 30, 80, 20], 0);
        builder.transformed_value_array_gte = pad_end([50, 10], 0);

        builder.execute();
    }

    #[test]
    fn assert_split_transformed_padded_arrays__without_padded_succeeds() {
        let builder = TestBuilder::new_without_padded();
        builder.execute();
    }

    #[test]
    fn assert_split_transformed_padded_arrays__empty_succeeds() {
        let builder = TestBuilder::new_empty();
        builder.execute();
    }

    #[test(should_fail_with = "invalid transformed value")]
    fn assert_split_transformed_padded_arrays__wrong_transformed_value_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_lt[1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "invalid transformed value")]
    fn assert_split_transformed_padded_arrays__wrong_transformed_value_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_gte[1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn assert_split_transformed_padded_arrays__extra_non_empty_item_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_lt[3] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "invalid transformed value")]
    fn assert_split_transformed_padded_arrays__extra_non_empty_item_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_gte[3] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn assert_split_transformed_padded_arrays__end_with_non_empty_item_in_lt_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_lt[NUM_TEST_ITEMS - 1] = 1;

        builder.execute();
    }

    #[test(should_fail_with = "array should be padded with empty items")]
    fn assert_split_transformed_padded_arrays__end_with_non_empty_item_in_gte_fails() {
        let mut builder = TestBuilder::new();

        builder.transformed_value_array_gte[NUM_TEST_ITEMS - 1] = 1;

        builder.execute();
    }

    /////////////////////////
    // With hint
    /////////////////////////

    #[test]
    fn assert_split_transformed_padded_arrays_with_hint__succeeds() {
        let builder = TestBuilder::new();
        builder.execute_with_hint();
    }

    #[test(should_fail_with = "incorrect first_after_split_index")]
    fn assert_split_transformed_padded_arrays_with_hint__first_after_split_index_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.first_after_split_index._value -= 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "first_after_split_index is too large")]
    fn assert_split_transformed_padded_arrays_with_hint__first_after_split_index_too_large_fails() {
        let mut builder = TestBuilder::new();

        builder.first_after_split_index._value += 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "incorrect first_padded_index")]
    fn assert_split_transformed_padded_arrays_with_hint__first_padded_index_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.first_padded_index._value -= 1;

        builder.execute_with_hint();
    }

    #[test(should_fail_with = "first_padded_index is too large")]
    fn assert_split_transformed_padded_arrays_with_hint__first_padded_index_too_large_fails() {
        let mut builder = TestBuilder::new();

        builder.first_padded_index._value += 1;

        builder.execute_with_hint();
    }
}
