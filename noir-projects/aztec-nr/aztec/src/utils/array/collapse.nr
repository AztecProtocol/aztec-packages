/// Collapses an array of `Option`s with sparse `Some` values into a `BoundedVec`, essentially unwrapping the `Option`s
/// and removing the `None` values.
///
/// For example, given:
///   `input: [some(3), none(), some(1)]`
/// this returns
///   `collapsed: [3, 1]`
pub fn collapse<T, let N: u32>(input: [Option<T>; N]) -> BoundedVec<T, N>
where
    T: Eq,
{
    // Computing the collpased BoundedVec would result in a very large number of constraints, since we'd need to loop
    // over the input array and conditionally write to a dynamic vec index, which is a very unfriendly pattern to the
    // proving backend.
    // Instead, we use an unconstrained function to produce the final collapsed array, along with some hints, and then
    // verify that the input and collapsed arrays are equivalent.
    let (collapsed, collapsed_to_input_index_mapping) = unsafe { get_collapse_hints(input) };
    verify_collapse_hints(input, collapsed, collapsed_to_input_index_mapping);
    collapsed
}

fn verify_collapse_hints<T, let N: u32>(
    input: [Option<T>; N],
    collapsed: BoundedVec<T, N>,
    collapsed_to_input_index_mapping: BoundedVec<u32, N>,
)
where
    T: Eq,
{
    // collapsed should be a BoundedVec with all the non-none elements in input, in the same order. We need to lay down
    // multiple constraints to guarantee this.
    // First we check that the number of elements is correct
    let mut count = 0;
    for i in 0..N {
        if input[i].is_some() {
            count += 1;
        }
    }
    assert_eq(count, collapsed.len(), "Wrong collapsed vec length");

    // Then we check that all elements exist in the original array, and are in the same order. To do this we use the
    // auxiliary collapsed_to_input_index_mapping array, which at index n contains the index in the input array that
    // corresponds to the collapsed entry at index n.
    // Example:
    //  - input: [some(3), none(), some(1)]
    //  - collapsed: [3, 1]
    //  - collapsed_to_input_index_mapping: [0, 2]
    // These two arrays should therefore have the same length.
    assert_eq(
        collapsed.len(),
        collapsed_to_input_index_mapping.len(),
        "Collapse hint vec length mismatch",
    );

    // We now look at each collapsed entry and check that there is a valid equal entry in the input array.
    let mut last_index = Option::none();
    for i in 0..N {
        if i < collapsed.len() {
            let input_index = collapsed_to_input_index_mapping.get_unchecked(i);
            assert(input_index < N, "Out of bounds index hint");

            assert_eq(
                collapsed.get_unchecked(i),
                input[input_index].unwrap(),
                "Wrong collapsed vec content",
            );

            // By requiring increasing input indices, we both guarantee that we're not looking at the same input
            // element more than once, and that we're going over them in the original order.
            if last_index.is_some() {
                assert(input_index > last_index.unwrap_unchecked(), "Wrong collapsed vec order");
            }
            last_index = Option::some(input_index);
        } else {
            // BoundedVec assumes that the unused parts of the storage are zeroed out (e.g. in the Eq impl), so we make
            // sure that this property holds.
            assert_eq(
                collapsed.get_unchecked(i),
                std::mem::zeroed(),
                "Dirty collapsed vec storage",
            );
        }
    }
    // We now know that:
    //  - all values in the collapsed array exist in the input array
    //  - the order of the collapsed values is the same as in the input array
    //  - no input value is present more than once in the collapsed array
    //  - the number of elements in the collapsed array is the same as in the input array.
    // Therefore, the collapsed array is correct.
}

unconstrained fn get_collapse_hints<T, let N: u32>(
    input: [Option<T>; N],
) -> (BoundedVec<T, N>, BoundedVec<u32, N>) {
    let mut collapsed: BoundedVec<T, N> = BoundedVec::new();
    let mut collapsed_to_input_index_mapping: BoundedVec<u32, N> = BoundedVec::new();

    for i in 0..N {
        if input[i].is_some() {
            collapsed.push(input[i].unwrap_unchecked());
            collapsed_to_input_index_mapping.push(i);
        }
    }

    (collapsed, collapsed_to_input_index_mapping)
}

mod test {
    use super::{collapse, verify_collapse_hints};

    #[test]
    unconstrained fn collapse_empty_array() {
        let original: [Option<Field>; 2] = [Option::none(), Option::none()];
        let collapsed = collapse(original);

        assert_eq(collapsed.len(), 0);
    }

    #[test]
    unconstrained fn collapse_non_sparse_array() {
        let original = [Option::some(7), Option::some(3), Option::none()];
        let collapsed = collapse(original);

        assert_eq(collapsed.len(), 2);
        assert_eq(collapsed.get(0), 7);
        assert_eq(collapsed.get(1), 3);
    }

    #[test]
    unconstrained fn collapse_sparse_array() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = collapse(original);

        assert_eq(collapsed.len(), 2);
        assert_eq(collapsed.get(0), 7);
        assert_eq(collapsed.get(1), 3);
    }

    #[test]
    unconstrained fn collapse_front_padding() {
        let original =
            [Option::none(), Option::none(), Option::some(7), Option::none(), Option::some(3)];
        let collapsed = collapse(original);

        assert_eq(collapsed.len(), 2);
        assert_eq(collapsed.get(0), 7);
        assert_eq(collapsed.get(1), 3);
    }

    #[test]
    unconstrained fn collapse_back_padding() {
        let original =
            [Option::some(7), Option::none(), Option::some(3), Option::none(), Option::none()];
        let collapsed = collapse(original);

        assert_eq(collapsed.len(), 2);
        assert_eq(collapsed.get(0), 7);
        assert_eq(collapsed.get(1), 3);
    }

    #[test]
    unconstrained fn verify_collapse_hints_good_hints() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7, 3]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 2]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Wrong collapsed vec length")]
    unconstrained fn verify_collapse_hints_wrong_length() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Collapse hint vec length mismatch")]
    unconstrained fn verify_collapse_hints_hint_length_mismatch() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7, 3]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Out of bounds index hint")]
    unconstrained fn verify_collapse_hints_out_of_bounds_index_hint() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7, 3]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 5]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail)]
    unconstrained fn verify_collapse_hints_hint_to_none() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7, 0]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 1]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Wrong collapsed vec content")]
    unconstrained fn verify_collapse_hints_wrong_vec_content() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([7, 42]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 2]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Wrong collapsed vec order")]
    unconstrained fn verify_collapse_hints_wrong_vec_order() {
        let original = [Option::some(7), Option::none(), Option::some(3)];
        let collapsed = BoundedVec::from_array([3, 7]);
        let collapsed_to_input_index_mapping = BoundedVec::from_array([2, 0]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

    #[test(should_fail_with = "Dirty collapsed vec storage")]
    unconstrained fn verify_collapse_hints_dirty_storage() {
        let original = [Option::some(7), Option::none(), Option::some(3)];

        let mut collapsed: BoundedVec<u32, 3> = BoundedVec::from_array([7, 3]);
        // We have to use the unchecked setter as we're knowingly writing past the length, breaking its invariants.
        collapsed.set_unchecked(2, 1);

        let collapsed_to_input_index_mapping = BoundedVec::from_array([0, 2]);

        verify_collapse_hints(original, collapsed, collapsed_to_input_index_mapping);
    }

}
