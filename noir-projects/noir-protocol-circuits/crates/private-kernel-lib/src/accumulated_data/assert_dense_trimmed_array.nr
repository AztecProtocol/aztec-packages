use types::utils::arrays::ClaimedLengthArray;

/// Validate that the array is dense trimmed:
/// - Items within `array.length` are not nullish.
/// - Items beyond `array.length` are nullish.
pub fn assert_dense_trimmed_array<T, let N: u32>(
    array: ClaimedLengthArray<T, N>,
    is_item_nullish: fn(T) -> bool,
) {
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
) {
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
) {
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
