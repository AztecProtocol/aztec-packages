pub struct SortedTuple<T> {
    pub elem: T,
    pub original_index: u32,
}

impl<T> Eq for SortedTuple<T>
where
    T: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.elem == other.elem) & (self.original_index == other.original_index)
    }
}

/// Sorts the input `array`, but also outputs an `original_index` field for each sorted
/// item, so that you know where it came from.
pub unconstrained fn get_sorted_tuples<T, let N: u32, Env>(
    array: [T; N],
    ordering: fn[Env](T, T) -> bool,
) -> [SortedTuple<T>; N]
where
    T: Eq,
{
    std::static_assert(N != 0, "Input array must not be zero-length");

    let mut tuples = [SortedTuple { elem: array[0], original_index: 0 }; N];
    for i in 0..N {
        tuples[i] = SortedTuple { elem: array[i], original_index: i };
    }
    tuples.sort_via(|a, b| ordering(a.elem, b.elem))
}

mod tests {
    use super::{get_sorted_tuples, SortedTuple};

    fn assert_eq_sorted_tuples<T, let N: u32, Env>(
        array: [T; N],
        ordering: fn[Env](T, T) -> bool,
        expected: [SortedTuple<T>; N],
    )
    where
        T: Eq,
    {
        // Safety: Testing an unconstrained function.
        let tuples = unsafe { get_sorted_tuples(array, ordering) };
        assert_eq(tuples, expected);

        // Verify original indices point to correct elements
        for i in 0..N {
            assert_eq(array[tuples[i].original_index], tuples[i].elem);
        }
    }

    #[test]
    fn sort_u64_in_ascending_order() {
        let array: [u64; 4] = [3, 2, 9, 5];
        let expected = [
            SortedTuple { elem: 2, original_index: 1 },
            SortedTuple { elem: 3, original_index: 0 },
            SortedTuple { elem: 5, original_index: 3 },
            SortedTuple { elem: 9, original_index: 2 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }

    #[test]
    fn sort_u64_in_descending_order() {
        let array: [u64; 4] = [3, 2, 9, 5];
        let expected = [
            SortedTuple { elem: 9, original_index: 2 },
            SortedTuple { elem: 5, original_index: 3 },
            SortedTuple { elem: 3, original_index: 0 },
            SortedTuple { elem: 2, original_index: 1 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a > b, expected);
    }

    #[test]
    fn sort_single_element() {
        let array: [u64; 1] = [42];
        let expected = [SortedTuple { elem: 42, original_index: 0 }];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }

    #[test]
    fn sort_already_sorted_array() {
        let array: [u64; 4] = [1, 2, 3, 4];
        let expected = [
            SortedTuple { elem: 1, original_index: 0 },
            SortedTuple { elem: 2, original_index: 1 },
            SortedTuple { elem: 3, original_index: 2 },
            SortedTuple { elem: 4, original_index: 3 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }

    #[test]
    fn sort_reverse_sorted_array() {
        let array: [u64; 4] = [4, 3, 2, 1];
        let expected = [
            SortedTuple { elem: 1, original_index: 3 },
            SortedTuple { elem: 2, original_index: 2 },
            SortedTuple { elem: 3, original_index: 1 },
            SortedTuple { elem: 4, original_index: 0 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }

    #[test]
    fn sort_with_duplicate_elements() {
        let array: [u64; 5] = [3, 1, 3, 2, 1];
        let expected = [
            SortedTuple { elem: 1, original_index: 4 },
            SortedTuple { elem: 1, original_index: 1 },
            SortedTuple { elem: 2, original_index: 3 },
            SortedTuple { elem: 3, original_index: 0 },
            SortedTuple { elem: 3, original_index: 2 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }

    #[test]
    fn sort_all_identical_elements() {
        let array: [u64; 4] = [5, 5, 5, 5];
        let expected = [
            SortedTuple { elem: 5, original_index: 3 },
            SortedTuple { elem: 5, original_index: 0 },
            SortedTuple { elem: 5, original_index: 1 },
            SortedTuple { elem: 5, original_index: 2 },
        ];
        assert_eq_sorted_tuples(array, |a, b| a < b, expected);
    }
}
