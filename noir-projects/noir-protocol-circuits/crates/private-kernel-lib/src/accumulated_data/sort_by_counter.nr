use types::{side_effect::Ordered, traits::Empty};

/// Compare two items to determine their order in the sorted array.
/// Returns true if `a` should be before `b` in the sorted array.
/// - An item with a smaller counter should be before an item with a larger counter.
/// - A non-empty item should be before an empty item.
pub fn compare_for_ascending_sort_with_empty_padding<T>(a: T, b: T) -> bool
where
    T: Ordered + Empty,
{
    !a.is_empty() & (b.is_empty() | (a.counter() < b.counter()))
}

/// Sort the items in **ascending** order by counter, ignoring empty items.
/// The result array will contain non-empty items sorted in ascending order by counter, followed by empty items.
pub unconstrained fn sort_by_counter<T, let N: u32>(array: [T; N]) -> [T; N]
where
    T: Ordered + Empty,
{
    array.sort_via(compare_for_ascending_sort_with_empty_padding)
}

mod tests {
    use super::{compare_for_ascending_sort_with_empty_padding, sort_by_counter};
    use types::{tests::types::TestValue, traits::Empty};

    unconstrained fn compare_test_items(value_1: u32, value_2: u32) -> bool {
        compare_for_ascending_sort_with_empty_padding(
            TestValue { value: value_1 as Field, counter: value_1 },
            TestValue { value: value_2 as Field, counter: value_2 },
        )
    }

    #[test]
    unconstrained fn compare_for_ascending_sort_with_empty_padding_as_expected() {
        assert_eq(compare_test_items(1, 2), true);
        assert_eq(compare_test_items(1, 1), false);
        assert_eq(compare_test_items(2, 1), false);
        assert_eq(compare_test_items(0, 0), false);
        assert_eq(compare_test_items(0, 1), false);
        assert_eq(compare_test_items(1, 0), true);
    }

    #[test]
    unconstrained fn all_non_empty_values() {
        let original = [
            TestValue { value: 14, counter: 4 },
            TestValue { value: 92, counter: 2 },
            TestValue { value: 21, counter: 1 },
            TestValue { value: 13, counter: 3 },
            TestValue { value: 75, counter: 5 },
        ];
        let expected = [
            TestValue { value: 21, counter: 1 },
            TestValue { value: 92, counter: 2 },
            TestValue { value: 13, counter: 3 },
            TestValue { value: 14, counter: 4 },
            TestValue { value: 75, counter: 5 },
        ];
        let sorted = sort_by_counter(original);
        assert_eq(sorted, expected);
    }

    #[test]
    unconstrained fn some_empty_values() {
        let original = [
            TestValue { value: 14, counter: 4 },
            TestValue { value: 92, counter: 2 },
            TestValue::empty(),
            TestValue::empty(),
            TestValue { value: 21, counter: 1 },
            TestValue { value: 13, counter: 3 },
            TestValue { value: 75, counter: 5 },
            TestValue::empty(),
        ];
        let expected = [
            TestValue { value: 21, counter: 1 },
            TestValue { value: 92, counter: 2 },
            TestValue { value: 13, counter: 3 },
            TestValue { value: 14, counter: 4 },
            TestValue { value: 75, counter: 5 },
            TestValue::empty(),
            TestValue::empty(),
            TestValue::empty(),
        ];
        let sorted = sort_by_counter(original);
        assert_eq(sorted, expected);
    }

    #[test]
    unconstrained fn non_empty_values_with_zero_counters() {
        let original = [
            TestValue { value: 55, counter: 1 },
            TestValue { value: 11, counter: 0 },
            TestValue { value: 33, counter: 2 },
            TestValue { value: 44, counter: 0 },
            TestValue { value: 22, counter: 0 },
            TestValue::empty(),
            TestValue::empty(),
        ];
        let expected = [
            TestValue { value: 22, counter: 0 },
            TestValue { value: 44, counter: 0 },
            TestValue { value: 11, counter: 0 },
            TestValue { value: 55, counter: 1 },
            TestValue { value: 33, counter: 2 },
            TestValue::empty(),
            TestValue::empty(),
        ];
        let sorted = sort_by_counter(original);
        assert_eq(sorted, expected);
    }
}
