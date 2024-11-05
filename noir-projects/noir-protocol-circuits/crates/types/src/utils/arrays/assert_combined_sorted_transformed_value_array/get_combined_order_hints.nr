use crate::{
    abis::side_effect::Ordered,
    traits::{Empty, is_empty},
    utils::arrays::{
        array_length, get_sorted_tuple::get_sorted_tuple,
        sort_by_counter::compare_by_counter_empty_padded_asc,
    },
};

pub struct CombinedOrderHint {
    counter: u32,
    original_index: u32,
}

impl CombinedOrderHint {
    pub fn empty() -> Self {
        CombinedOrderHint { counter: 0, original_index: 0 }
    }
}

impl Eq for CombinedOrderHint {
    fn eq(self, other: Self) -> bool {
        (self.counter == other.counter) & (self.original_index == other.original_index)
    }
}

pub unconstrained fn count_private_items<T, let N: u32>(array: [T; N]) -> u32
where
    T: Ordered + Empty + Eq,
{
    let mut length = 0;
    for item in array {
        if !is_empty(item) & (item.counter() == 0) {
            length += 1;
        }
    }
    length
}

pub unconstrained fn get_combined_order_hints_asc<T, let N: u32>(
    array_lt: [T; N],
    array_gte: [T; N],
) -> [CombinedOrderHint; N]
where
    T: Ordered + Eq + Empty,
{
    let mut hints = [CombinedOrderHint::empty(); N];
    let sorted_lt = get_sorted_tuple(array_lt, compare_by_counter_empty_padded_asc);
    let sorted_gte = get_sorted_tuple(array_gte, compare_by_counter_empty_padded_asc);
    let num_private_lt = count_private_items(array_lt);
    let num_private_gte = count_private_items(array_gte);
    let num_lt = array_length(array_lt);
    let total_private = num_private_lt + num_private_gte;
    let total_non_public_gte = num_lt + num_private_gte;
    for i in 0..N {
        let sorted = if i < num_private_lt {
            sorted_lt[i]
        } else if i < total_private {
            sorted_gte[i - num_private_lt]
        } else if i < total_non_public_gte {
            sorted_lt[i - num_private_gte]
        } else {
            sorted_gte[i - num_lt]
        };
        hints[i].original_index = sorted.original_index;
        hints[i].counter = sorted.elem.counter();
    }
    hints
}

mod tests {
    use crate::{
        tests::{types::TestValue, utils::pad_end},
        utils::arrays::assert_combined_sorted_transformed_value_array::get_combined_order_hints::{
            CombinedOrderHint, get_combined_order_hints_asc,
        },
    };

    fn asc_to_equal<let N: u32>(
        array_lt: [TestValue; N],
        array_gte: [TestValue; N],
        expected: [CombinedOrderHint; N],
    ) {
        let hints = unsafe { get_combined_order_hints_asc(array_lt, array_gte) };
        assert_eq(hints, expected);
    }

    #[test]
    fn get_combined_order_hints_asc_full_non_empty() {
        let array_lt = pad_end(
            [
                TestValue { value: 600, counter: 9 },
                TestValue { value: 400, counter: 3 },
                TestValue { value: 500, counter: 6 },
            ],
            TestValue::empty(),
        );
        let array_gte = pad_end(
            [
                TestValue { value: 200, counter: 13 },
                TestValue { value: 100, counter: 19 },
                TestValue { value: 300, counter: 16 },
            ],
            TestValue::empty(),
        );
        let expected_hints = [
            CombinedOrderHint { counter: 3, original_index: 1 },
            CombinedOrderHint { counter: 6, original_index: 2 },
            CombinedOrderHint { counter: 9, original_index: 0 },
            CombinedOrderHint { counter: 13, original_index: 0 },
            CombinedOrderHint { counter: 16, original_index: 2 },
            CombinedOrderHint { counter: 19, original_index: 1 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_padded_empty() {
        let array_lt = pad_end(
            [TestValue { value: 500, counter: 6 }, TestValue { value: 400, counter: 3 }],
            TestValue::empty(),
        );
        let array_gte = pad_end([TestValue { value: 100, counter: 19 }], TestValue::empty());
        let expected_hints = [
            CombinedOrderHint { counter: 3, original_index: 1 },
            CombinedOrderHint { counter: 6, original_index: 0 },
            CombinedOrderHint { counter: 19, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 0, original_index: 2 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_lt_empty() {
        let array_lt = [TestValue::empty(); 4];
        let array_gte = pad_end(
            [TestValue { value: 200, counter: 13 }, TestValue { value: 100, counter: 19 }],
            TestValue::empty(),
        );
        let expected_hints = [
            CombinedOrderHint { counter: 13, original_index: 0 },
            CombinedOrderHint { counter: 19, original_index: 1 },
            CombinedOrderHint { counter: 0, original_index: 2 },
            CombinedOrderHint { counter: 0, original_index: 3 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_gte_empty() {
        let array_lt = pad_end(
            [TestValue { value: 400, counter: 3 }, TestValue { value: 500, counter: 6 }],
            TestValue::empty(),
        );
        let array_gte = [TestValue::empty(); 4];
        let expected_hints = [
            CombinedOrderHint { counter: 3, original_index: 0 },
            CombinedOrderHint { counter: 6, original_index: 1 },
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_all_empty() {
        let array_lt = [TestValue::empty(); 3];
        let array_gte = [TestValue::empty(); 3];
        let expected_hints = [
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 0, original_index: 2 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_prepended_zero_counters() {
        let array_lt = pad_end(
            [
                TestValue { value: 700, counter: 0 },
                TestValue { value: 500, counter: 0 },
                TestValue { value: 100, counter: 16 },
                TestValue { value: 400, counter: 13 },
            ],
            TestValue::empty(),
        );
        let array_gte = pad_end(
            [
                TestValue { value: 300, counter: 0 },
                TestValue { value: 600, counter: 0 },
                TestValue { value: 200, counter: 19 },
            ],
            TestValue::empty(),
        );
        let expected_hints = [
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 13, original_index: 3 },
            CombinedOrderHint { counter: 16, original_index: 2 },
            CombinedOrderHint { counter: 19, original_index: 2 },
            CombinedOrderHint { counter: 0, original_index: 3 },
            CombinedOrderHint { counter: 0, original_index: 4 },
            CombinedOrderHint { counter: 0, original_index: 5 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_prepended_zero_counters_lt_empty() {
        let array_lt = [TestValue::empty(); 6];
        let array_gte = pad_end(
            [
                TestValue { value: 300, counter: 0 },
                TestValue { value: 600, counter: 0 },
                TestValue { value: 200, counter: 19 },
                TestValue { value: 400, counter: 13 },
            ],
            TestValue::empty(),
        );
        let expected_hints = [
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 13, original_index: 3 },
            CombinedOrderHint { counter: 19, original_index: 2 },
            CombinedOrderHint { counter: 0, original_index: 4 },
            CombinedOrderHint { counter: 0, original_index: 5 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }

    #[test]
    fn get_combined_order_hints_asc_prepended_zero_counters_gte_empty() {
        let array_lt = pad_end(
            [
                TestValue { value: 300, counter: 0 },
                TestValue { value: 600, counter: 0 },
                TestValue { value: 200, counter: 19 },
                TestValue { value: 400, counter: 13 },
            ],
            TestValue::empty(),
        );
        let array_gte = [TestValue::empty(); 6];
        let expected_hints = [
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
            CombinedOrderHint { counter: 13, original_index: 3 },
            CombinedOrderHint { counter: 19, original_index: 2 },
            CombinedOrderHint { counter: 0, original_index: 0 },
            CombinedOrderHint { counter: 0, original_index: 1 },
        ];
        asc_to_equal(array_lt, array_gte, expected_hints);
    }
}
