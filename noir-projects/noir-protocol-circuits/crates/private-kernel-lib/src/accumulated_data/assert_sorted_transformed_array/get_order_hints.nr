use crate::accumulated_data::sort_by_counter::compare_for_ascending_sort_with_empty_padding;
use types::{side_effect::Ordered, traits::Empty, utils::arrays::get_sorted_tuples};

pub struct OrderHints<let N: u32> {
    pub sorted_counters: [u32; N],
    pub sorted_indexes: [u32; N],
}

impl<let N: u32> Eq for OrderHints<N> {
    fn eq(self, other: Self) -> bool {
        (self.sorted_counters == other.sorted_counters)
            & (self.sorted_indexes == other.sorted_indexes)
    }
}

/// Generates hints for more efficient validation in `assert_sorted_transformed_array`.
///
/// ### Inputs
/// - `original_array`: The array whose items are to be sorted.
///
/// ### Outputs
/// `OrderHints`: Metadata describing how items should be mapped and ordered. It contains:
/// - `sorted_indexes[i]`: the index in the `sorted_array` for `original_array[i]`.
/// - `sorted_counters[i]`: the counter of the item in `sorted_array[i]`.
pub unconstrained fn get_order_hints<T, let N: u32>(original_array: [T; N]) -> OrderHints<N>
where
    T: Ordered + Empty,
{
    let sorted_tuples = get_sorted_tuples(
        original_array,
        compare_for_ascending_sort_with_empty_padding,
    );

    let mut sorted_counters = [0; N];
    let mut sorted_indexes = [0; N];
    for i in 0..N {
        let elem = sorted_tuples[i].elem;
        sorted_counters[i] = elem.counter();
        let original_index = if elem.counter() == 0 {
            i
        } else {
            sorted_tuples[i].original_index
        };
        sorted_indexes[original_index] = i;
    }

    OrderHints { sorted_counters, sorted_indexes }
}

mod tests {
    use super::{get_order_hints, OrderHints};
    use types::tests::{types::TestValue, utils::pad_end};

    #[test]
    unconstrained fn full_non_empty_items() {
        let array = [
            TestValue { value: 100, counter: 9 },
            TestValue { value: 200, counter: 3 },
            TestValue { value: 300, counter: 6 },
        ];
        let expected = OrderHints { sorted_counters: [3, 6, 9], sorted_indexes: [2, 0, 1] };
        let hints = get_order_hints(array);
        assert_eq(hints, expected);
    }

    #[test]
    unconstrained fn with_padded_empty_items() {
        let array = pad_end([
            TestValue { value: 100, counter: 9 },
            TestValue { value: 200, counter: 3 },
            TestValue { value: 300, counter: 6 },
        ]);
        let expected = OrderHints {
            sorted_counters: [3, 6, 9, 0, 0],
            sorted_indexes: [2, 0, 1, 3, 4], // `sorted_index` of the padded empty item equals `i`
        };
        let hints = get_order_hints(array);
        assert_eq(hints, expected);
    }
}
