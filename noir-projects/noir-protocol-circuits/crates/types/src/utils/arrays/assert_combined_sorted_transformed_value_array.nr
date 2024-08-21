mod combine_sort;
mod get_combined_order_hints;

use crate::{
    abis::side_effect::Ordered, traits::{Empty, is_empty},
    utils::arrays::{
    array_length,
    assert_combined_sorted_transformed_value_array::get_combined_order_hints::CombinedOrderHint
}
};

// original_array(_lt/_gte) must be valid, i.e. validate_array(original_array) == true
pub fn assert_combined_sorted_transformed_value_array_asc<T, S, let N: u32, Env>(
    original_array_lt: [T; N],
    original_array_gte: [T; N],
    sorted_transformed_value_array: [S; N],
    is_transformed: fn[Env](T, S) -> bool,
    hints: [CombinedOrderHint; N]
) where T: Ordered + Empty + Eq, S: Empty + Eq {
    let num_lt = array_length(original_array_lt);
    let num_gte = array_length(original_array_gte);
    let total_num = num_lt + num_gte;

    let mut prev_counter = 0;
    let mut is_lt = true;
    let mut should_be_empty = false;
    for i in 0..N {
        is_lt &= i != num_lt;
        should_be_empty |= i == total_num;
        let hint = hints[i];
        let original = if is_lt {
            original_array_lt[hint.original_index]
        } else {
            original_array_gte[hint.original_index]
        };
        let dest = sorted_transformed_value_array[i];
        let dest_counter = hint.counter;
        assert(is_transformed(original, dest), "incorrect transformed value");
        assert_eq(original.counter(), dest_counter, "mismatch counter");
        if !should_be_empty {
            if dest_counter != 0 {
                assert(
                    dest_counter > prev_counter, "value array must be sorted by counter in ascending order"
                );
            } else {
                assert((prev_counter == 0) | (i == num_lt), "items with 0 counters should be prepended");
                let sorted_index = if is_lt {
                    hint.original_index
                } else {
                    hint.original_index + num_lt
                };
                assert_eq(sorted_index, i, "order of the items with 0 counters should be preserved");
            }
            prev_counter = dest_counter;
        } else {
            assert(is_empty(dest), "array must be padded with empty items");
        }
    }
}

mod tests {
    use crate::{
        abis::side_effect::Ordered, tests::utils::pad_end, traits::Empty,
        utils::arrays::{
        assert_combined_sorted_transformed_value_array::{
        assert_combined_sorted_transformed_value_array_asc, combine_sort::combine_sort_asc,
        get_combined_order_hints::{CombinedOrderHint, get_combined_order_hints_asc}
    }
    }
    };

    struct TestItem {
        name: Field,
        price: Field,
        tax: Field,
        counter: u32,
    }

    impl Ordered for TestItem {
        fn counter(self) -> u32 {
            self.counter
        }
    }

    impl Empty for TestItem {
        fn empty() -> Self {
            TestItem { name: 0, price: 0, tax: 0, counter: 0 }
        }
    }

    impl Eq for TestItem {
        fn eq(self, other: Self) -> bool {
            (self.name == other.name) & (self.price == other.price) & (self.tax == other.tax) & (self.counter == other.counter)
        }
    }

    struct TestValue {
        name: Field,
        total: Field,
    }

    impl Empty for TestValue {
        fn empty() -> Self {
            TestValue { name: 0, total: 0 }
        }
    }

    impl Eq for TestValue {
        fn eq(self, other: Self) -> bool {
            (self.name == other.name) & (self.total == other.total)
        }
    }

    fn transform(item: TestItem) -> TestValue {
        TestValue { name: item.name, total: item.price + item.tax }
    }

    fn is_transformed(item: TestItem, value: TestValue) -> bool {
        (item.name == value.name) & ((item.price + item.tax) == value.total)
    }

    struct TestDataBuilder<T, S, let N: u32> {
        original_array_lt: [T; N],
        original_array_gte: [T; N],
        sorted_transformed_value_array: [S; N],
        hints: [CombinedOrderHint; N],
    }

    impl TestDataBuilder<TestItem, TestValue, 12> {
        pub fn new() -> Self {
            let original_array_lt = pad_end(
                [
                TestItem { name: 7, price: 40, tax: 7, counter: 0 },
                TestItem { name: 4, price: 70, tax: 6, counter: 0 },
                TestItem { name: 6, price: 80, tax: 1, counter: 22 },
                TestItem { name: 3, price: 30, tax: 4, counter: 11 }
            ],
                TestItem::empty()
            );

            let original_array_gte = pad_end(
                [
                TestItem { name: 9, price: 20, tax: 2, counter: 0 },
                TestItem { name: 8, price: 90, tax: 3, counter: 0 },
                TestItem { name: 5, price: 50, tax: 9, counter: 55 },
                TestItem { name: 1, price: 60, tax: 8, counter: 33 },
                TestItem { name: 2, price: 10, tax: 5, counter: 44 }
            ],
                TestItem::empty()
            );

            let sorted_transformed_value_array = pad_end(
                [
                TestValue { name: 7, total: 47 },
                TestValue { name: 4, total: 76 },
                TestValue { name: 3, total: 34 },
                TestValue { name: 6, total: 81 },
                TestValue { name: 9, total: 22 },
                TestValue { name: 8, total: 93 },
                TestValue { name: 1, total: 68 },
                TestValue { name: 2, total: 15 },
                TestValue { name: 5, total: 59 }
            ],
                TestValue::empty()
            );

            let hints = [
                CombinedOrderHint { counter: 0, original_index: 0 },
                CombinedOrderHint { counter: 0, original_index: 1 },
                CombinedOrderHint { counter: 11, original_index: 3 },
                CombinedOrderHint { counter: 22, original_index: 2 },
                CombinedOrderHint { counter: 0, original_index: 0 },
                CombinedOrderHint { counter: 0, original_index: 1 },
                CombinedOrderHint { counter: 33, original_index: 3 },
                CombinedOrderHint { counter: 44, original_index: 4 },
                CombinedOrderHint { counter: 55, original_index: 2 },
                CombinedOrderHint { counter: 0, original_index: 5 },
                CombinedOrderHint { counter: 0, original_index: 6 },
                CombinedOrderHint { counter: 0, original_index: 7 }
            ];

            TestDataBuilder { original_array_lt, original_array_gte, sorted_transformed_value_array, hints }
        }

        pub fn execute(self) {
            assert_combined_sorted_transformed_value_array_asc(
                self.original_array_lt,
                self.original_array_gte,
                self.sorted_transformed_value_array,
                is_transformed,
                self.hints
            );
        }
    }

    #[test]
    fn assert_combined_sorted_transformed_value_array_asc_succeeds() {
        let builder = TestDataBuilder::new();

        let hints = get_combined_order_hints_asc(builder.original_array_lt, builder.original_array_gte);
        assert_eq(hints, builder.hints);

        let sorted = combine_sort_asc(builder.original_array_lt, builder.original_array_gte).map(transform);
        assert_eq(sorted, builder.sorted_transformed_value_array);

        builder.execute();
    }

    #[test(should_fail_with="incorrect transformed value")]
    fn assert_combined_sorted_transformed_value_array_asc_mismatch_value_fails() {
        let mut builder = TestDataBuilder::new();

        // Tweak the value at index 1.
        builder.sorted_transformed_value_array[1].total += 1;

        builder.execute();
    }

    #[test(should_fail_with="incorrect transformed value")]
    fn assert_combined_sorted_transformed_value_array_asc_cross_boundary_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 1 and 4.
        let tmp = builder.sorted_transformed_value_array[1];
        builder.sorted_transformed_value_array[1] = builder.sorted_transformed_value_array[4];
        builder.sorted_transformed_value_array[4] = tmp;

        builder.execute();
    }

    #[test(should_fail_with="order of the items with 0 counters should be preserved")]
    fn assert_combined_sorted_transformed_value_array_asc_unordered_prepended_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 0 and 1.
        let tmp = builder.sorted_transformed_value_array[0];
        builder.sorted_transformed_value_array[0] = builder.sorted_transformed_value_array[1];
        builder.sorted_transformed_value_array[1] = tmp;

        // Update hints.
        let tmp = builder.hints[0];
        builder.hints[0] = builder.hints[1];
        builder.hints[1] = tmp;

        builder.execute();
    }

    #[test(should_fail_with="items with 0 counters should be prepended")]
    fn assert_combined_sorted_transformed_value_array_asc_mixed_prepended_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 1 and 2.
        let tmp = builder.sorted_transformed_value_array[1];
        builder.sorted_transformed_value_array[1] = builder.sorted_transformed_value_array[2];
        builder.sorted_transformed_value_array[2] = tmp;

        // Update hints.
        let tmp = builder.hints[1];
        builder.hints[1] = builder.hints[2];
        builder.hints[2] = tmp;

        builder.execute();
    }

    #[test(should_fail_with="value array must be sorted by counter in ascending order")]
    fn assert_combined_sorted_transformed_value_array_asc_unordered_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 2 and 3.
        let tmp = builder.sorted_transformed_value_array[2];
        builder.sorted_transformed_value_array[2] = builder.sorted_transformed_value_array[3];
        builder.sorted_transformed_value_array[3] = tmp;

        // Update hints.
        let tmp = builder.hints[2];
        builder.hints[2] = builder.hints[3];
        builder.hints[3] = tmp;

        builder.execute();
    }

    #[test(should_fail_with="mismatch counter")]
    fn assert_combined_sorted_transformed_value_array_asc_unordered_values_with_ordered_counters_fails() {
        let mut builder = TestDataBuilder::new();

        // Swap the values at index 2 and 3.
        let tmp = builder.sorted_transformed_value_array[2];
        builder.sorted_transformed_value_array[2] = builder.sorted_transformed_value_array[3];
        builder.sorted_transformed_value_array[3] = tmp;

        // Update indexes in hints.
        let tmp = builder.hints[2].original_index;
        builder.hints[2].original_index = builder.hints[3].original_index;
        builder.hints[3].original_index = tmp;

        builder.execute();
    }

    #[test(should_fail_with="array must be padded with empty items")]
    fn assert_combined_sorted_transformed_value_array_asc_extra_non_empty_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item.
        builder.sorted_transformed_value_array[9] = builder.sorted_transformed_value_array[8];
        builder.hints[9] = builder.hints[8];

        builder.execute();
    }

    #[test(should_fail_with="items with 0 counters should be prepended")]
    fn assert_combined_sorted_transformed_value_array_asc_extra_empty_fails() {
        let mut builder = TestDataBuilder::new();

        // Clear an item.
        builder.sorted_transformed_value_array[8] = TestValue::empty();
        builder.hints[8] = CombinedOrderHint { counter: 0, original_index: 6 };

        builder.execute();
    }

    #[test(should_fail_with="order of the items with 0 counters should be preserved")]
    fn assert_combined_sorted_transformed_value_array_asc_extra_prepended_fails() {
        let mut builder = TestDataBuilder::new();

        // Add an item.
        builder.sorted_transformed_value_array[6] = builder.sorted_transformed_value_array[5];
        builder.hints[6] = builder.hints[5];

        builder.execute();
    }
}

