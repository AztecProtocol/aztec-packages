/// Returns `DST_LEN` elements from a source array, starting at `offset`. `DST_LEN` must not be larger than the number
/// of elements past `offset`.
///
/// Examples:
/// ```
/// let foo: [Field; 2] = subarray([1, 2, 3, 4, 5], 2);
/// assert_eq(foo, [3, 4]);
///
/// let bar: [Field; 5] = subarray([1, 2, 3, 4, 5], 2); // fails - we can't return 5 elements since only 3 remain
/// ```
pub fn subarray<T, let SRC_LEN: u32, let DST_LEN: u32>(
    src: [T; SRC_LEN],
    offset: u32,
) -> [T; DST_LEN] {
    assert(offset + DST_LEN <= SRC_LEN, "DST_LEN too large for offset");

    let mut dst: [T; DST_LEN] = std::mem::zeroed();
    for i in 0..DST_LEN {
        dst[i] = src[i + offset];
    }

    dst
}

mod test {
    use super::subarray;

    #[test]
    unconstrained fn subarray_into_empty() {
        // In all of these cases we're setting DST_LEN to be 0, so we always get back an emtpy array.
        assert_eq(subarray::<Field, _, _>([], 0), []);
        assert_eq(subarray([1, 2, 3, 4, 5], 0), []);
        assert_eq(subarray([1, 2, 3, 4, 5], 2), []);
    }

    #[test]
    unconstrained fn subarray_complete() {
        assert_eq(subarray::<Field, _, _>([], 0), []);
        assert_eq(subarray([1, 2, 3, 4, 5], 0), [1, 2, 3, 4, 5]);
    }

    #[test]
    unconstrained fn subarray_different_end_sizes() {
        // We implicitly select how many values to read in the size of the return array
        assert_eq(subarray([1, 2, 3, 4, 5], 1), [2, 3, 4, 5]);
        assert_eq(subarray([1, 2, 3, 4, 5], 1), [2, 3, 4]);
        assert_eq(subarray([1, 2, 3, 4, 5], 1), [2, 3]);
        assert_eq(subarray([1, 2, 3, 4, 5], 1), [2]);
    }

    #[test(should_fail_with = "DST_LEN too large for offset")]
    unconstrained fn subarray_offset_too_large() {
        // With an offset of 1 we can only request up to 4 elements
        let _: [_; 5] = subarray([1, 2, 3, 4, 5], 1);
    }

    #[test(should_fail)]
    unconstrained fn subarray_bad_return_value() {
        assert_eq(subarray([1, 2, 3, 4, 5], 1), [3, 3, 4, 5]);
    }
}
