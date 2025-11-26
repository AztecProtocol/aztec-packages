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

pub unconstrained fn get_sorted_tuples<T, let N: u32, Env>(
    array: [T; N],
    ordering: fn[Env](T, T) -> bool,
) -> [SortedTuple<T>; N]
where
    T: Eq,
{
    let mut tuples = [SortedTuple { elem: array[0], original_index: 0 }; N];
    for i in 0..N {
        tuples[i] = SortedTuple { elem: array[i], original_index: i };
    }
    tuples.sort_via(|a, b| ordering(a.elem, b.elem))
}

mod tests {
    use super::{get_sorted_tuples, SortedTuple};

    #[test]
    unconstrained fn sort_u64_in_ascending_order() {
        let array: [u64; 4] = [3, 2, 9, 5];
        let expected = [
            SortedTuple { elem: 2, original_index: 1 },
            SortedTuple { elem: 3, original_index: 0 },
            SortedTuple { elem: 5, original_index: 3 },
            SortedTuple { elem: 9, original_index: 2 },
        ];
        let tuples = get_sorted_tuples(array, |a, b| a < b);
        assert_eq(tuples, expected);
    }
}
