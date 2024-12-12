use crate::utils::array;

/// Returns `DST_MAX_LEN` elements from a source BoundedVec, starting at `offset`. `offset` must not be larger than the
/// original length, and `DST_LEN` must not be larger than the total number of elements past `offset` (including the
/// zeroed elements past `len()`).
///
/// Only elements at the beginning of the vector can be removed: it is not possible to also remove elements at the end
/// of the vector by passing a value for `DST_LEN` that is smaller than `len() - offset`.
///
/// Examples:
/// ```
/// let foo = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);
/// assert_eq(subbvec(foo, 2), BoundedVec::<_, 8>::from_array([3, 4, 5]));
///
/// let bar: BoundedVec<_, 1> = subbvec(foo, 2); // fails - we can't return just 1 element since 3 remain
/// let baz: BoundedVec<_, 10> = subbvec(foo, 3); // fails - we can't return 10 elements since only 7 remain
/// ```
pub fn subbvec<T, let SRC_MAX_LEN: u32, let DST_MAX_LEN: u32>(
    vec: BoundedVec<T, SRC_MAX_LEN>,
    offset: u32,
) -> BoundedVec<T, DST_MAX_LEN> {
    // from_parts_unchecked does not verify that the elements past len are zeroed, but that is not an issue in our case
    // because we're constructing the new storage array as a subarray of the original one (which should have zeroed
    // storage past len), guaranteeing correctness. This is because `subarray` does not allow extending arrays past
    // their original length.
    BoundedVec::from_parts_unchecked(
        array::subarray(vec.storage(), offset),
        vec.len() - offset,
    )
}

mod test {
    use super::subbvec;

    #[test]
    unconstrained fn subbvec_empty() {
        let bvec = BoundedVec::<Field, 0>::from_array([]);
        assert_eq(subbvec(bvec, 0), bvec);
    }

    #[test]
    unconstrained fn subbvec_complete() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);
        assert_eq(subbvec(bvec, 0), bvec);

        let smaller_capacity = BoundedVec::<_, 5>::from_array([1, 2, 3, 4, 5]);
        assert_eq(subbvec(bvec, 0), smaller_capacity);
    }

    #[test]
    unconstrained fn subbvec_partial() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);

        assert_eq(subbvec(bvec, 2), BoundedVec::<_, 8>::from_array([3, 4, 5]));
        assert_eq(subbvec(bvec, 2), BoundedVec::<_, 3>::from_array([3, 4, 5]));
    }

    #[test]
    unconstrained fn subbvec_into_empty() {
        let bvec: BoundedVec<_, 10> = BoundedVec::from_array([1, 2, 3, 4, 5]);
        assert_eq(subbvec(bvec, 5), BoundedVec::<_, 5>::from_array([]));
    }

    #[test(should_fail)]
    unconstrained fn subbvec_offset_past_len() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);
        let _: BoundedVec<_, 1> = subbvec(bvec, 6);
    }

    #[test(should_fail)]
    unconstrained fn subbvec_insufficient_dst_len() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);

        // We're not providing enough space to hold all of the items inside the original BoundedVec. subbvec can cause
        // for the capacity to reduce, but not the length (other than by len - offset).
        let _: BoundedVec<_, 1> = subbvec(bvec, 2);
    }

    #[test(should_fail_with="DST_LEN too large for offset")]
    unconstrained fn subbvec_dst_len_causes_enlarge() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);

        // subbvec does not supprt capacity increases
        let _: BoundedVec<_, 11> = subbvec(bvec, 0);
    }

    #[test(should_fail_with="DST_LEN too large for offset")]
    unconstrained fn subbvec_dst_len_too_large_for_offset() {
        let bvec = BoundedVec::<_, 10>::from_array([1, 2, 3, 4, 5]);

        // This effectively requests a capacity increase, since there'd be just one element plus the 5 empty slots,
        // which is less than 7.
        let _: BoundedVec<_, 7> = subbvec(bvec, 4);
    }
}