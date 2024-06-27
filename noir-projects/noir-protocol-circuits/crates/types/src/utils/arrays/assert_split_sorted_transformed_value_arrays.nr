use crate::{
    abis::side_effect::Ordered, traits::{Empty, is_empty},
    utils::arrays::{sort_get_split_order_hints::SplitOrderHints, validate_array}
};

// original_array must be valid, i.e. validate_array(original_array) == true
// transformed_value_array must be verified against original_array before calling this function.
fn assert_split_sorted_transformed_value_arrays<T, S, N>(
    original_array: [T; N],
    transformed_value_array: [S; N],
    split_counter: u32,
    sorted_transformed_value_array_lt: [S; N], // Values whose counters are less than the split counter.
    sorted_transformed_value_array_gte: [S; N], // Values whose counters are greater than or equal to the split counter.
    sorted_counters_lt: [u32; N], // Counters of the values in sorted_transformed_value_array_lt.
    sorted_counters_gte: [u32; N], // Counters of the values in sorted_transformed_value_array_gte.
    index_hints: [u32; N], // The index of the item in the correspinding sorted_transformed_value_array_(lt/gte) for each item in the original_array.
    ascending: bool // Whether the items in sorted_transformed_value_array_(lt/gte) is in ascending order.
) where T: Ordered + Empty + Eq, S: Empty + Eq {
    let mut num_lt = 0;
    let mut num_gte = 0;
    for i in 0..N {
        let original = original_array[i];
        if !is_empty(original) {
            let value = transformed_value_array[i];
            let is_lt = (original.counter() < split_counter) | (original.counter() == 0); // If counter is 0, the value should always be in the lt(non-revertible) set. Currently this only applies to the first nullifier.
            let mut sorted_array = sorted_transformed_value_array_gte;
            let mut sorted_counters = sorted_counters_gte;
            let mut num = num_gte;
            if is_lt {
                sorted_array = sorted_transformed_value_array_lt;
                sorted_counters = sorted_counters_lt;
                num = num_lt;
            };
            let mut sorted_index = index_hints[i];
            if original.counter() == 0 {
                // Values with 0 counter must be at the begining.
                sorted_index = num;
            }
            assert_eq(value, sorted_array[sorted_index], "mismatch sorted values");
            assert_eq(original.counter(), sorted_counters[sorted_index], "mismatch counters");
            if num != 0 {
                let is_incrementing = sorted_counters[num] > sorted_counters[num - 1];
                assert(ascending == is_incrementing, "value array must be sorted by counter");
                assert(sorted_counters[num] != sorted_counters[num - 1], "counters cannot be the same");
            }
            if is_lt {
                num_lt += 1;
            } else {
                num_gte += 1;
            }
        }
    }

    let non_zero_values_lt = validate_array(sorted_transformed_value_array_lt);
    assert_eq(non_zero_values_lt, num_lt, "mismatch number of values lt");
    // Cannot use validate_array to check the number of non-zero counters, as the counter might be 0.
    // let non_zero_counters_lt = validate_array(sorted_counters_lt);
    let mut should_be_zero = false;
    for i in 0..N {
        should_be_zero |= i == num_lt;
        if should_be_zero {
            // Make sure every counter at or after index num_lt is 0.
            assert_eq(sorted_counters_lt[i], 0, "mismatch number of counters lt");
        }
    }

    let non_zero_values_gte = validate_array(sorted_transformed_value_array_gte);
    assert_eq(non_zero_values_gte, num_gte, "mismatch number of values gte");
    let non_zero_counters_gte = validate_array(sorted_counters_gte);
    assert_eq(non_zero_counters_gte, num_gte, "mismatch number of counters gte");
}

pub fn assert_split_sorted_transformed_value_arrays_asc<T, S, N>(
    original_array: [T; N],
    transformed_value_array: [S; N],
    split_counter: u32,
    sorted_transformed_value_array_lt: [S; N],
    sorted_transformed_value_array_gte: [S; N],
    hints: SplitOrderHints<N>
) where T: Ordered + Empty + Eq, S: Empty + Eq {
    assert_split_sorted_transformed_value_arrays(
        original_array,
        transformed_value_array,
        split_counter,
        sorted_transformed_value_array_lt,
        sorted_transformed_value_array_gte,
        hints.sorted_counters_lt,
        hints.sorted_counters_gte,
        hints.sorted_indexes,
        true
    );
}

pub fn assert_split_sorted_transformed_value_arrays_desc<T, S, N>(
    original_array: [T; N],
    transformed_value_array: [S; N],
    split_counter: u32,
    sorted_transformed_value_array_lt: [S; N],
    sorted_transformed_value_array_gte: [S; N],
    hints: SplitOrderHints<N>
) where T: Ordered + Empty + Eq, S: Empty + Eq {
    assert_split_sorted_transformed_value_arrays(
        original_array,
        transformed_value_array,
        split_counter,
        sorted_transformed_value_array_lt,
        sorted_transformed_value_array_gte,
        hints.sorted_counters_lt,
        hints.sorted_counters_gte,
        hints.sorted_indexes,
        false
    );
}

mod tests {
    use crate::{
        abis::side_effect::Ordered, traits::Empty,
        utils::arrays::{
        assert_split_sorted_transformed_value_arrays::{assert_split_sorted_transformed_value_arrays_asc, assert_split_sorted_transformed_value_arrays_desc},
        sort_get_split_order_hints::SplitOrderHints
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

    fn transform_value(item: TestItem) -> TestValue {
        TestValue { name: item.name, total: item.price + item.tax }
    }

    struct TestDataBuilder<T, S, N> {
        original_array: [T; N],
        transformed_value_array: [S; N],
        sorted_transformed_value_array_lt: [S; N],
        sorted_transformed_value_array_gte: [S; N],
        split_counter: u32,
        hints: SplitOrderHints<N>,
    }

    impl TestDataBuilder<TestItem, TestValue, 6> {
        pub fn new() -> Self {
            let original_array = [
                TestItem { name: 100, price: 10, tax: 5, counter: 44 },
                TestItem { name: 200, price: 20, tax: 6, counter: 22 },
                TestItem { name: 300, price: 30, tax: 7, counter: 11 },
                TestItem { name: 400, price: 40, tax: 8, counter: 33 },
                TestItem::empty(),
                TestItem::empty()
            ];
            let transformed_value_array = original_array.map(|item: TestItem| transform_value(item));

            let sorted_transformed_value_array_lt = [TestValue::empty(); 6];
            let sorted_transformed_value_array_gte = [
                TestValue { name: 300, total: 37 },
                TestValue { name: 200, total: 26 },
                TestValue { name: 400, total: 48 },
                TestValue { name: 100, total: 15 },
                TestValue::empty(),
                TestValue::empty()
            ];
            let hints = SplitOrderHints {
                sorted_counters_lt: [0; 6],
                sorted_counters_gte: [11, 22, 33, 44, 0, 0],
                sorted_indexes: [3, 1, 0, 2, 0, 0]
            };

            TestDataBuilder {
                original_array,
                transformed_value_array,
                sorted_transformed_value_array_lt,
                sorted_transformed_value_array_gte,
                split_counter: 0,
                hints
            }
        }

        pub fn execute_asc(self) {
            assert_split_sorted_transformed_value_arrays_asc(
                self.original_array,
                self.transformed_value_array,
                self.split_counter,
                self.sorted_transformed_value_array_lt,
                self.sorted_transformed_value_array_gte,
                self.hints
            );
        }

        pub fn execute_desc(self) {
            assert_split_sorted_transformed_value_arrays_desc(
                self.original_array,
                self.transformed_value_array,
                self.split_counter,
                self.sorted_transformed_value_array_lt,
                self.sorted_transformed_value_array_gte,
                self.hints
            );
        }
    }

    #[test]
    fn assert_split_sorted_transformed_value_array_asc_zero_split_counter_succeeds() {
        let builder = TestDataBuilder::new();
        builder.execute_asc();
    }

    #[test]
    fn assert_split_sorted_transformed_value_array_asc_non_zero_split_counter_succeeds() {
        let mut builder = TestDataBuilder::new();

        builder.split_counter = 15;
        builder.sorted_transformed_value_array_lt = [
            TestValue { name: 300, total: 37 },
            TestValue::empty(),
            TestValue::empty(),
            TestValue::empty(),
            TestValue::empty(),
            TestValue::empty()
        ];
        builder.sorted_transformed_value_array_gte = [
            TestValue { name: 200, total: 26 },
            TestValue { name: 400, total: 48 },
            TestValue { name: 100, total: 15 },
            TestValue::empty(),
            TestValue::empty(),
            TestValue::empty()
        ];
        builder.hints.sorted_counters_lt = [11, 0, 0, 0, 0, 0];
        builder.hints.sorted_counters_gte = [22, 33, 44, 0, 0, 0];
        builder.hints.sorted_indexes = [2, 0, 0, 1, 0, 0];

        builder.execute_asc();
    }

    #[test]
    fn assert_split_sorted_transformed_value_array_desc_zero_split_counter_succeeds() {
        let mut builder = TestDataBuilder::new();

        builder.split_counter = 0;
        builder.sorted_transformed_value_array_gte = [
            TestValue { name: 100, total: 15 },
            TestValue { name: 400, total: 48 },
            TestValue { name: 200, total: 26 },
            TestValue { name: 300, total: 37 },
            TestValue::empty(),
            TestValue::empty()
        ];
        builder.hints.sorted_counters_lt = [0, 0, 0, 0, 0, 0];
        builder.hints.sorted_counters_gte = [44, 33, 22, 11, 0, 0];
        builder.hints.sorted_indexes = [0, 2, 3, 1, 0, 0];

        builder.execute_desc();
    }

    #[test]
    fn assert_split_sorted_transformed_value_array_desc_non_zero_split_counter_succeeds() {
        let mut builder = TestDataBuilder::new();

        builder.split_counter = 15;
        builder.sorted_transformed_value_array_lt = [
                TestValue { name: 300, total: 37 },
                TestValue::empty(),
                TestValue::empty(),
                TestValue::empty(),
                TestValue::empty(),
                TestValue::empty()
            ];
        builder.sorted_transformed_value_array_gte = [
                TestValue { name: 100, total: 15 },
                TestValue { name: 400, total: 48 },
                TestValue { name: 200, total: 26 },
                TestValue::empty(),
                TestValue::empty(),
                TestValue::empty()
            ];
        builder.hints.sorted_counters_lt = [11, 0, 0, 0, 0, 0];
        builder.hints.sorted_counters_gte = [44, 33, 22, 0, 0, 0];
        builder.hints.sorted_indexes = [0, 2, 0, 1, 0, 0];

        builder.execute_desc();
    }
}
