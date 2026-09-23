use types::{traits::Empty, utils::arrays::ClaimedLengthArray};

/// Validate that the array is dense trimmed:
/// - Items within `array.length` are not nullish.
/// - Items beyond `array.length` are nullish.
pub fn assert_dense_trimmed_array<T, let N: u32>(
    array: ClaimedLengthArray<T, N>,
    is_item_nullish: fn(T) -> bool,
)
where
    T: Empty,
{
    // The `i == array.length` breakpoint below only fires if `array.length <= N`. A larger claimed length
    // would leave every slot treated as within the length and skip the checks on the slots beyond it.
    array.assert_length_within_bounds("claimed length exceeds array size");

    let mut should_be_nullish = false;
    for i in 0..N {
        should_be_nullish |= i == array.length;
        let item = array.array[i];
        let is_nullish = is_item_nullish(item);
        assert_eq(is_nullish, should_be_nullish, "array is not dense trimmed");
    }
}

/// Validate that the array is dense:
/// - Items within `array.length` are populated.
pub fn assert_dense_array<T, let N: u32>(
    array: ClaimedLengthArray<T, N>,
    is_item_populated: fn(T) -> bool,
)
where
    T: Empty,
{
    // The `i == array.length` breakpoint below only fires if `array.length <= N`. A larger claimed length
    // would leave every slot treated as within the length and skip the checks on the slots beyond it.
    array.assert_length_within_bounds("claimed length exceeds array size");

    let mut should_be_populated = true;
    for i in 0..N {
        should_be_populated &= i != array.length;
        let item = array.array[i];
        let is_populated = is_item_populated(item);
        if should_be_populated {
            assert(is_populated, "array is not dense");
        }
    }
}

/// Validate that the array is trimmed:
/// - Items beyond `array.length` are nullish.
pub fn assert_trimmed_array<T, let N: u32>(
    array: ClaimedLengthArray<T, N>,
    is_item_nullish: fn(T) -> bool,
)
where
    T: Empty,
{
    // The `i == array.length` breakpoint below only fires if `array.length <= N`. A larger claimed length
    // would leave every slot treated as within the length and skip the checks on the slots beyond it.
    array.assert_length_within_bounds("claimed length exceeds array size");

    let mut should_be_nullish = false;
    for i in 0..N {
        should_be_nullish |= i == array.length;
        let item = array.array[i];
        let is_nullish = is_item_nullish(item);
        if should_be_nullish {
            assert(is_nullish, "array is not trimmed");
        }
    }
}

mod tests {
    use super::{assert_dense_array, assert_dense_trimmed_array, assert_trimmed_array};
    use types::utils::arrays::ClaimedLengthArray;

    fn is_zero(x: Field) -> bool {
        x == 0
    }

    fn is_non_zero(x: Field) -> bool {
        x != 0
    }

    #[test]
    fn full_array_passes() {
        let array = ClaimedLengthArray { array: [1, 2, 3, 4], length: 4 };
        assert_dense_trimmed_array(array, is_zero);
        assert_dense_array(array, is_non_zero);
        assert_trimmed_array(array, is_zero);
    }

    #[test]
    fn partially_filled_array_passes() {
        let array = ClaimedLengthArray { array: [1, 2, 0, 0], length: 2 };
        assert_dense_trimmed_array(array, is_zero);
        assert_dense_array(array, is_non_zero);
        assert_trimmed_array(array, is_zero);
    }

    #[test(should_fail_with = "claimed length exceeds array size")]
    fn dense_trimmed_rejects_length_beyond_array_size() {
        let array = ClaimedLengthArray { array: [1, 2, 3, 4], length: 5 };
        assert_dense_trimmed_array(array, is_zero);
    }

    #[test(should_fail_with = "claimed length exceeds array size")]
    fn dense_rejects_length_beyond_array_size() {
        let array = ClaimedLengthArray { array: [1, 2, 3, 4], length: 5 };
        assert_dense_array(array, is_non_zero);
    }

    // Without the length bound, a claimed length beyond the array size would skip every trimmed check, so the
    // non-empty trailing items here would be accepted.
    #[test(should_fail_with = "claimed length exceeds array size")]
    fn trimmed_rejects_length_beyond_array_size() {
        let array = ClaimedLengthArray { array: [1, 2, 9, 9], length: 5 };
        assert_trimmed_array(array, is_zero);
    }
}
