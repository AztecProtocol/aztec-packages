use crate::accumulated_data::sort_by_counter::compare_for_ascending_sort_with_empty_padding;
use types::{side_effect::Ordered, traits::Empty, utils::arrays::get_sorted_tuples};

pub struct SplitOrderHints<let N: u32> {
    pub sorted_counters_lt: [u32; N],
    pub sorted_counters_gte: [u32; N],
    pub sorted_indexes: [u32; N],
}

impl<let N: u32> Eq for SplitOrderHints<N> {
    fn eq(self, other: Self) -> bool {
        (self.sorted_counters_lt == other.sorted_counters_lt)
            & (self.sorted_counters_gte == other.sorted_counters_gte)
            & (self.sorted_indexes == other.sorted_indexes)
    }
}

/// Generates hints for more efficient validation in `assert_split_sorted_transformed_arrays`.
///
/// ### Inputs
/// - `original_array`: The array to divide into two arrays based on the split counter.
/// - `split_counter`: The counter value used to divide items into the two arrays.
///
/// ### Outputs
/// `SplitOrderHints`: Metadata describing how items are mapped and ordered across the two arrays. It contains:
/// - `sorted_indexes[i]`: the index in the corresponding sorted array for `original_array[i]`.
/// - `sorted_counters_lt[i]`: the counter of the item in `sorted_transformed_array_lt[i]`.
/// - `sorted_counters_gte[i]`: the counter of the item in `sorted_transformed_array_gte[i]`.
pub unconstrained fn get_split_order_hints<T, let N: u32>(
    original_array: [T; N],
    split_counter: u32,
) -> SplitOrderHints<N>
where
    T: Ordered + Empty,
{
    let sorted_tuples = get_sorted_tuples(
        original_array,
        compare_for_ascending_sort_with_empty_padding,
    );

    let mut sorted_counters_lt = [0; N];
    let mut sorted_counters_gte = [0; N];
    let mut sorted_indexes = [0; N];
    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut found_split = false;
    for i in 0..N {
        let elem = sorted_tuples[i].elem;
        if !elem.is_empty() {
            let is_gte = (elem.counter() >= split_counter) & (elem.counter() != 0);
            found_split |= is_gte;
            if !found_split {
                sorted_counters_lt[num_lt] = elem.counter();
                num_lt += 1;
            } else {
                sorted_counters_gte[num_gte] = elem.counter();
                num_gte += 1;
            }
            let original_index = sorted_tuples[i].original_index;
            sorted_indexes[original_index] = if !found_split { i } else { i - num_lt };
        }
    }

    SplitOrderHints { sorted_counters_lt, sorted_counters_gte, sorted_indexes }
}

mod tests {
    use super::{get_split_order_hints, SplitOrderHints};
    use types::tests::{types::TestValue, utils::pad_end};

    global default_values: [TestValue; 5] = [
        TestValue { value: 1, counter: 33 },
        TestValue { value: 2, counter: 55 },
        TestValue { value: 3, counter: 22 },
        TestValue { value: 4, counter: 11 },
        TestValue { value: 5, counter: 44 },
    ];

    struct TestBuilder<let N: u32> {
        original_array: [TestValue; N],
        split_counter: u32,
    }

    impl TestBuilder<5> {
        pub fn new_full() -> Self {
            Self::new(default_values, 0)
        }
    }

    impl TestBuilder<7> {
        pub fn new_padded() -> Self {
            Self::new(default_values, 0)
        }
    }

    impl<let N: u32> TestBuilder<N> {
        pub fn new<let M: u32>(values: [TestValue; M], split_counter: u32) -> Self {
            TestBuilder { original_array: pad_end(values), split_counter }
        }

        pub unconstrained fn expect_hints_equal(self, expected: SplitOrderHints<N>) {
            let hints = get_split_order_hints(self.original_array, self.split_counter);
            assert_eq(hints, expected);
        }
    }

    #[test]
    unconstrained fn full_non_empty_items_zero_split_counter() {
        let builder = TestBuilder::new_full();
        builder.expect_hints_equal(
            SplitOrderHints {
                sorted_counters_lt: [0, 0, 0, 0, 0],
                sorted_counters_gte: [11, 22, 33, 44, 55],
                sorted_indexes: [2, 4, 1, 0, 3],
            },
        );
    }

    #[test]
    unconstrained fn full_non_empty_items_non_zero_split_counter() {
        let mut builder = TestBuilder::new_full();

        builder.split_counter = 25;

        builder.expect_hints_equal(
            SplitOrderHints {
                sorted_counters_lt: pad_end([11, 22]),
                sorted_counters_gte: pad_end([33, 44, 55]),
                sorted_indexes: [0, 2, 1, 0, 1],
            },
        );
    }

    #[test]
    unconstrained fn empty_padded_zero_split_counter() {
        let builder = TestBuilder::new_padded();
        builder.expect_hints_equal(
            SplitOrderHints {
                sorted_counters_lt: pad_end([]),
                sorted_counters_gte: pad_end([11, 22, 33, 44, 55]),
                sorted_indexes: [2, 4, 1, 0, 3, 0, 0],
            },
        );
    }

    #[test]
    unconstrained fn empty_padded_non_zero_split_counter() {
        let mut builder = TestBuilder::new_padded();

        builder.split_counter = 25;

        builder.expect_hints_equal(
            SplitOrderHints {
                sorted_counters_lt: pad_end([11, 22]),
                sorted_counters_gte: pad_end([33, 44, 55]),
                sorted_indexes: [0, 2, 1, 0, 1, 0, 0],
            },
        );
    }

    #[test]
    unconstrained fn empty_padded_non_zero_split_counter_equals_value() {
        let mut builder = TestBuilder::new_padded();

        // The split counter equals one of the values.
        builder.split_counter = 44;

        builder.expect_hints_equal(
            SplitOrderHints {
                sorted_counters_lt: pad_end([11, 22, 33]),
                sorted_counters_gte: pad_end([44, 55]),
                sorted_indexes: [2, 1, 1, 0, 0, 0, 0],
            },
        );
    }
}
