/// Copies up to `num_items_to_copy` items from `array2` into `array1`, starting at `start_index`, and returns a new
/// array with the modifications.
///
/// - Fails if writing `array2[i]` into `array1[start_index + i]` would exceed the bounds of `array1`.
/// - Only the first `num_items_to_copy` elements of `array2` are copied.
/// - At most `array2.len()` items from `array2` will be copied.
///
/// Note: This function may silently stop copying from `array2` once `array2` ends. It's the caller's responsibility to
/// ensure that `num_items_to_copy` is not greater than `array2.len()` if this is desired.
pub fn copy_items_into_array<T, let N: u32, let M: u32>(
    array1: [T; N],
    start_index: u32,
    array2: [T; M],
    num_items_to_copy: u32,
) -> [T; N]
where
    T: Eq,
{
    // Safety: result is constrained below by `validate_copy_items_into_result`.
    let result =
        unsafe { copy_items_into_array_helper(array1, start_index, array2, num_items_to_copy) };

    validate_copy_items_into_result(array1, start_index, array2, num_items_to_copy, result);

    result
}

/// Validates that `result` is the correct output of copying `num_items_to_copy` items from `array2`
/// into `array1` starting at `start_index`.
///
/// This function verifies that:
/// - Elements before `start_index` in `result` match `array1`
/// - Elements from `start_index` to `start_index + num_items_to_copy - 1` match the corresponding elements from `array2`
/// - Elements from `start_index + num_items_to_copy` onwards match `array1`
fn validate_copy_items_into_result<T, let N: u32, let M: u32>(
    array1: [T; N],
    start_index: u32,
    array2: [T; M],
    num_items_to_copy: u32,
    result: [T; N],
)
where
    T: Eq,
{
    let end_index = start_index + num_items_to_copy;
    // Tracks whether we've reached or passed start_index (false -> true transition at i == start_index)
    let mut is_gte_start = false;
    // Tracks whether we're still before end_index (true -> false transition at i == end_index)
    let mut is_lt_end = true;
    for i in 0..N {
        is_gte_start |= i == start_index;
        is_lt_end &= i != end_index;
        // In the copy region (start_index <= i < end_index): expect array2 value
        // Outside the copy region: expect original array1 value
        let expected = if is_gte_start & is_lt_end {
            array2[i - start_index]
        } else {
            array1[i]
        };
        assert_eq(
            result[i],
            expected,
            "Mismatch expected and actual values: copy_items_into_array",
        );
    }
}

/// Unconstrained helper that performs the actual array copy operation.
/// This runs outside the constraint code for efficiency, with the result validated by `validate_copy_items_into_result`.
unconstrained fn copy_items_into_array_helper<T, let N: u32, let M: u32>(
    array1: [T; N],
    start_index: u32,
    array2: [T; M],
    num_items_to_copy: u32,
) -> [T; N] {
    let mut result: [T; N] = array1;
    for i in 0..N {
        if i < num_items_to_copy {
            result[i + start_index] = array2[i];
        }
    }
    result
}

mod tests {
    use super::{copy_items_into_array, validate_copy_items_into_result};

    // --- validate_copy_items_into_result ---
    // Tests for validate_copy_items_into_result to verify that tampered results are rejected.
    // These tests ensure the validation function correctly catches any modifications to the result array.

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_before_copy_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Tamper with element at index 0 (before the copy region)
        let tampered_result = [999, 10, 20, 30, 5];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_at_start_boundary() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Tamper with element at index 1 (the start of the copy region)
        let tampered_result = [1, 999, 20, 30, 5];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_in_copy_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Tamper with element at index 2 (middle of the copy region)
        let tampered_result = [1, 10, 999, 30, 5];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_at_end_boundary() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Tamper with element at index 3 (the last element of the copy region)
        let tampered_result = [1, 10, 20, 999, 5];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_after_copy_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Tamper with element at index 4 (after the copy region)
        let tampered_result = [1, 10, 20, 30, 999];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_when_copying_from_start() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 0 would be [10, 20, 30, 4, 5]
        // Tamper with the first element (in the copy region)
        let tampered_result = [999, 20, 30, 4, 5];
        validate_copy_items_into_result(array1, 0, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_tampered_element_when_copying_to_end() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 2 would be [1, 2, 10, 20, 30]
        // Tamper with the last element (in the copy region)
        let tampered_result = [1, 2, 10, 20, 999];
        validate_copy_items_into_result(array1, 2, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_completely_wrong_result() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Provide a completely incorrect result
        let tampered_result = [999, 999, 999, 999, 999];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_swapped_values_in_copy_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Correct result for copying 3 items starting at index 1 would be [1, 10, 20, 30, 5]
        // Swap values within the copy region
        let tampered_result = [1, 20, 10, 30, 5];
        validate_copy_items_into_result(array1, 1, array2, 3, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: copy_items_into_array")]
    fn validate_rejects_when_copy_zero_but_result_differs() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // When copying 0 items, the result should be identical to array1
        let tampered_result = [1, 2, 999, 4, 5];
        validate_copy_items_into_result(array1, 0, array2, 0, tampered_result);
    }

    // --- copy_items_into_array ---

    #[test]
    fn copy_to_fill_from_start_to_middle() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 3 items from array2, starting at index 0 in array1.
        let result = copy_items_into_array(array1, 0, array2, 3);
        assert_eq(result, [10, 20, 30, 4, 5]);
    }

    #[test]
    fn copy_to_fill_from_start_to_end() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 5 items from array2, starting at index 0 in array1.
        let result = copy_items_into_array(array1, 0, array2, 5);
        assert_eq(result, [10, 20, 30, 40, 50]);
    }

    #[test]
    fn copy_to_fill_in_middle() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 3 items from array2, starting at index 1 in array1.
        let result = copy_items_into_array(array1, 1, array2, 3);
        assert_eq(result, [1, 10, 20, 30, 5]);
    }

    #[test]
    fn copy_to_fill_from_middle_to_end() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 3 items from array2, starting at index 2 in array1.
        let result = copy_items_into_array(array1, 2, array2, 3);
        assert_eq(result, [1, 2, 10, 20, 30]);
    }

    #[test]
    fn copy_to_overfill_from_start() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 6 items from array2. Only 5 items from array2 are actually copied.
        assert_eq(copy_items_into_array(array1, 0, array2, 6), [10, 20, 30, 40, 50]);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn copy_to_overfill_from_middle() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 3 items from array2, starting at index 3 in array1.
        let _ = copy_items_into_array(array1, 3, array2, 3);
    }

    #[test]
    fn validate_result_copy_to_overfill_from_middle() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Same as the above test, but avoid calling the unconstrained function and have the result validated directly.
        // Copy 3 items from array2, starting at index 3 in array1.
        // At most 2 items from array2 are copied.
        let result = [1, 2, 3, 10, 20];
        validate_copy_items_into_result(array1, 3, array2, 3, result);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn copy_to_fill_from_out_of_bounds() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 3 items from array2, starting at index beyond the size of array1.
        let _ = copy_items_into_array(array1, array1.len(), array2, 3);
    }

    #[test]
    fn validate_result_copy_to_fill_from_out_of_bounds() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Same as the above test, but avoid calling the unconstrained function and have the result validated directly.
        // Copy 3 items from array2, starting at index beyond the size of array1.
        // Nothing from array2 is copied.
        let result = [1, 2, 3, 4, 5];
        validate_copy_items_into_result(array1, array1.len(), array2, 3, result);
    }

    #[test]
    fn copy_nothing() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 0 items from array2.
        let result = copy_items_into_array(array1, 0, array2, 0);
        assert_eq(result, [1, 2, 3, 4, 5]);
    }

    #[test]
    fn copy_nothing_to_fill_from_out_of_bounds() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50, 60];
        // Copy 0 items from array2, starting at index beyond the size of array1.
        let result = copy_items_into_array(array1, array1.len(), array2, 0);
        // It didn't fail. Nothing was copied.
        assert_eq(result, [1, 2, 3, 4, 5]);
    }

    #[test]
    fn copy_more_than_array2_length() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        // Copy more items than array2 has.
        let result = copy_items_into_array(array1, 0, array2, array2.len() + 1);
        // It didn't fail. All items in array2 were copied.
        assert_eq(result, [10, 20, 30, 40, 50]);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn copy_more_than_array2_length_smaller_than_array1_length() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30];
        // Similar to the above test, copying more items than array2 has.
        // But this time, the length of array2 is smaller than the length of array1.
        let _ = copy_items_into_array(array1, 0, array2, array2.len() + 1);
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn validate_result_copy_more_than_array2_length_smaller_than_array1_length() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30];
        // Same as the above test, but avoid calling the unconstrained function and have the result validated directly.
        // The index out of bound error is still thrown from validating the result.
        let result = [10, 20, 30, 4, 5];
        validate_copy_items_into_result(array1, 0, array2, array2.len() + 1, result);
    }
}
