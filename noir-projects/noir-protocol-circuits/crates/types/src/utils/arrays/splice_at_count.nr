/// Splices two fixed-size arrays at `count`.
///
/// The result consists of:
/// - the first `count` elements from `array1`, followed by
/// - the first `N - count` elements from `array2`,
/// producing a new array of length `N`.
///
/// In other words:
/// - `result[0..count] == array1[0..count]`
/// - `result[count..N] == array2[0..(N - count)]`
///
/// Note: This function does not consider any notion of "used length". It always copies exactly `N - count` elements
/// from `array2`. If `array2` has fewer meaningful items than that, elements from its higher indices (typically
/// padding) will be included in the result. Callers must ensure that `count` correctly reflects the intended splice
/// point and that no meaningful elements are truncated.
pub fn splice_at_count<T, let N: u32>(array1: [T; N], count: u32, array2: [T; N]) -> [T; N]
where
    T: Eq,
{
    // `count` is the splice point: `result[0..count]` comes from `array1` and `result[count..N]` from
    // `array2`. A `count` greater than `N` is not a valid splice point, so reject it rather than
    // silently returning `array1` unchanged (the helper loop would be skipped). `count == N` is valid.
    assert(count <= N, "Invalid count: splice_at_count requires count <= N");

    // Safety: result is constrained below by `validate_splice_at_count_result`.
    let result = unsafe { splice_at_count_helper(array1, count, array2) };

    validate_splice_at_count_result(array1, count, array2, result);

    result
}

/// Validates that `result` is the correct splice of `array1` and `array2` at `count`.
/// Specifically, this function asserts that:
/// - `result[0..count] == array1[0..count]`, and
/// - `result[count..N] == array2[0..(N - count)]`.
fn validate_splice_at_count_result<T, let N: u32>(
    array1: [T; N],
    count: u32,
    array2: [T; N],
    result: [T; N],
)
where
    T: Eq,
{
    let mut should_copy_from_2 = false;
    for i in 0..N {
        should_copy_from_2 |= i == count;
        if should_copy_from_2 {
            assert_eq(
                result[i],
                array2[i - count],
                "Mismatch expected and actual values: splice_at_count (array2)",
            );
        } else {
            assert_eq(
                result[i],
                array1[i],
                "Mismatch expected and actual values: splice_at_count (array1)",
            );
        }
    }
}

/// Performs the splice operation for `splice_at_count` unconstrained-ly.
/// This runs outside the constraint code for efficiency, with the result validated by `validate_splice_at_count_result`.
unconstrained fn splice_at_count_helper<T, let N: u32>(
    array1: [T; N],
    count: u32,
    array2: [T; N],
) -> [T; N] {
    let mut result = array1;
    for i in count..N {
        result[i] = array2[i - count];
    }
    result
}

mod tests {
    use super::{splice_at_count, validate_splice_at_count_result};

    // --- splice_at_count: happy path ---

    #[test]
    fn merge_all_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 0, array2);
        assert_eq(result, [10, 20, 30, 40, 50]);
    }

    #[test]
    fn merge_all_from_array1() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 5, array2);
        assert_eq(result, [1, 2, 3, 4, 5]);
    }

    #[test(should_fail_with = "Invalid count: splice_at_count requires count <= N")]
    fn count_out_of_bounds_fails() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let _ = splice_at_count(array1, 6, array2);
    }

    #[test(should_fail_with = "Invalid count: splice_at_count requires count <= N")]
    fn count_far_out_of_bounds_fails() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let _ = splice_at_count(array1, 100, array2);
    }

    #[test]
    fn splice_single_element_arrays() {
        assert_eq(splice_at_count([1], 0, [9]), [9]); // count 0: all from array2
        assert_eq(splice_at_count([1], 1, [9]), [1]); // count == N: all from array1
    }

    #[test]
    fn merge_one_from_array1_rest_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 1, array2);
        assert_eq(result, [1, 10, 20, 30, 40]);
    }

    #[test]
    fn merge_two_from_array1_rest_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 2, array2);
        assert_eq(result, [1, 2, 10, 20, 30]);
    }

    #[test]
    fn merge_three_from_array1_rest_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 3, array2);
        assert_eq(result, [1, 2, 3, 10, 20]);
    }

    #[test]
    fn merge_four_from_array1_one_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = splice_at_count(array1, 4, array2);
        assert_eq(result, [1, 2, 3, 4, 10]);
    }

    // --- validate_splice_at_count_result: correct results accepted ---

    #[test]
    fn validate_accepts_correct_merge_in_middle() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let result = [1, 2, 10, 20, 30];
        validate_splice_at_count_result(array1, 2, array2, result);
    }

    #[test]
    fn validate_accepts_correct_merge_all_from_array1() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        validate_splice_at_count_result(array1, 5, array2, array1);
    }

    #[test]
    fn validate_accepts_correct_merge_all_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        validate_splice_at_count_result(array1, 0, array2, array2);
    }

    // --- validate_splice_at_count_result: tampered results rejected ---

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array1)")]
    fn validate_rejects_tampered_element_in_array1_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [999, 2, 10, 20, 30];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array2)")]
    fn validate_rejects_tampered_element_at_boundary() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [1, 2, 999, 20, 30];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array2)")]
    fn validate_rejects_tampered_element_in_array2_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [1, 2, 10, 999, 30];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array2)")]
    fn validate_rejects_tampered_last_element() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [1, 2, 10, 20, 999];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array2)")]
    fn validate_rejects_tampered_when_all_from_array2() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [999, 20, 30, 40, 50];
        validate_splice_at_count_result(array1, 0, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array1)")]
    fn validate_rejects_tampered_when_all_from_array1() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [1, 2, 3, 4, 999];
        validate_splice_at_count_result(array1, 5, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array1)")]
    fn validate_rejects_completely_wrong_result() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [999, 999, 999, 999, 999];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }

    #[test(should_fail_with = "Mismatch expected and actual values: splice_at_count (array2)")]
    fn validate_rejects_swapped_values_in_array2_region() {
        let array1 = [1, 2, 3, 4, 5];
        let array2 = [10, 20, 30, 40, 50];
        let tampered_result = [1, 2, 20, 10, 30];
        validate_splice_at_count_result(array1, 2, array2, tampered_result);
    }
}
