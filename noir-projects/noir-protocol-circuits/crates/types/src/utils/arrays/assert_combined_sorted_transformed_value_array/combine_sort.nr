use crate::{
    abis::side_effect::Ordered, traits::Empty,
    utils::arrays::{array_length, sort_by_counter::sort_by_counter_asc}
};

// Both arrays are valid, i.e., empty items are padded to the right.
// And both arrays might contain items with 0 counters, which are prepended to the arrays.
// This function will keep the items with 0 counter prepended, sort the items with non-zero counters, and combine all non-empty items.
pub fn combine_sort_asc<T, let N: u32>(
    array_lt: [T; N],
    array_gte: [T; N]
) -> [T; N] where T: Ordered + Empty + Eq {
    let sorted_array_lt = sort_by_counter_asc(array_lt);
    let sorted_array_gte = sort_by_counter_asc(array_gte);
    let num_lt = array_length(array_lt);
    let mut combined = array_lt;
    for i in 0..N {
        let original_index = if i < num_lt { i } else { i - num_lt };
        let from = if i < num_lt {
            array_lt[original_index]
        } else {
            array_gte[original_index]
        };
        if from.counter() == 0 {
            combined[i] = from;
        } else if i < num_lt {
            combined[i] = sorted_array_lt[original_index];
        } else {
            combined[i] = sorted_array_gte[original_index];
        }
    }
    combined
}

mod tests {
    use crate::{
        abis::side_effect::Ordered, tests::utils::pad_end, traits::Empty,
        utils::arrays::assert_combined_sorted_transformed_value_array::combine_sort::combine_sort_asc
    };

    struct TestItem {
        value: u32,
        counter: u32,
    }

    impl Ordered for TestItem {
        fn counter(self) -> u32 {
            self.counter
        }
    }

    impl Eq for TestItem {
        fn eq(self, other: Self) -> bool {
            (self.value == other.value) & (self.counter == other.counter)
        }
    }

    impl Empty for TestItem {
        fn empty() -> Self {
            TestItem { value: 0, counter: 0 }
        }
    }

    #[test]
    fn combine_sort_asc_full_non_empty() {
        let array_lt = pad_end(
            [
            TestItem { value: 44, counter: 0 },
            TestItem { value: 88, counter: 0 },
            TestItem { value: 77, counter: 3 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 33, counter: 2 }
        ],
            TestItem::empty()
        );
        let array_gte = pad_end(
            [
            TestItem { value: 66, counter: 0 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 99, counter: 0 },
            TestItem { value: 00, counter: 5 },
            TestItem { value: 22, counter: 4 }
        ],
            TestItem::empty()
        );
        let expected = [
            TestItem { value: 44, counter: 0 },
            TestItem { value: 88, counter: 0 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 33, counter: 2 },
            TestItem { value: 77, counter: 3 },
            TestItem { value: 66, counter: 0 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 99, counter: 0 },
            TestItem { value: 22, counter: 4 },
            TestItem { value: 00, counter: 5 }
        ];
        assert_eq(combine_sort_asc(array_lt, array_gte), expected);
    }

    #[test]
    fn combine_sort_asc_padded_empty() {
        let array_lt = pad_end(
            [
            TestItem { value: 44, counter: 0 },
            TestItem { value: 88, counter: 0 },
            TestItem { value: 77, counter: 3 },
            TestItem { value: 55, counter: 1 }
        ],
            TestItem::empty()
        );
        let array_gte = pad_end(
            [
            TestItem { value: 66, counter: 0 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 00, counter: 5 },
            TestItem { value: 22, counter: 4 }
        ],
            TestItem::empty()
        );
        let expected = [
            TestItem { value: 44, counter: 0 },
            TestItem { value: 88, counter: 0 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 77, counter: 3 },
            TestItem { value: 66, counter: 0 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 22, counter: 4 },
            TestItem { value: 00, counter: 5 },
            TestItem::empty(),
            TestItem::empty()
        ];
        assert_eq(combine_sort_asc(array_lt, array_gte), expected);
    }

    #[test]
    fn combine_sort_asc_padded_empty_no_prepended() {
        let array_lt: [TestItem; 10] = pad_end(
            [
            TestItem { value: 77, counter: 3 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 33, counter: 2 }
        ],
            TestItem::empty()
        );
        let array_gte = pad_end(
            [
            TestItem { value: 00, counter: 5 },
            TestItem { value: 22, counter: 4 }
        ],
            TestItem::empty()
        );
        let expected = pad_end(
            [
            TestItem { value: 55, counter: 1 },
            TestItem { value: 33, counter: 2 },
            TestItem { value: 77, counter: 3 },
            TestItem { value: 22, counter: 4 },
            TestItem { value: 00, counter: 5 }
        ],
            TestItem::empty()
        );
        assert_eq(combine_sort_asc(array_lt, array_gte), expected);
    }
}
