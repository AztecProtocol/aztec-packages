pub(crate) mod assert_trailing_zeros;
pub(crate) mod splice_at_count;
pub(crate) mod find_index;
pub(crate) mod get_sorted_tuples;
pub(crate) mod claimed_length_array;

// Re-exports.
pub use assert_trailing_zeros::assert_trailing_zeros;
pub use claimed_length_array::ClaimedLengthArray;
pub use find_index::{find_first_index, find_last_index};
pub use get_sorted_tuples::{get_sorted_tuples, SortedTuple};
pub use splice_at_count::splice_at_count;

use crate::traits::Empty;

// TODO: Consider making this a part of the noir stdlib.
/// Helper fn to create a subarray from a given array.
pub fn subarray<T, let N: u32, let M: u32>(array: [T; N], offset: u32) -> [T; M]
where
    T: Empty,
{
    let mut result: [T; M] = [T::empty(); M];
    for i in 0..M {
        result[i] = array[offset + i];
    }
    result
}

/// Helper function to count the number of non-empty elements in a validated array.
/// Danger: This is only safe to call if the input arrays have been "validated" (dense lhs, empty rhs).
/// 1. All elements before the first empty element are non-empty
/// 2. All elements after and including the first empty element are empty
/// 3. The array forms a contiguous sequence of non-empty elements followed by empty elements
pub fn array_length<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty,
{
    // We get the length by checking the index of the first empty element.

    // Safety: This is safe because we have validated the array (see function doc comment above) and the emptiness
    // of the element and non-emptiness of the previous element is checked below.
    let length = unsafe { find_first_index(array, |elem: T| elem.is_empty()) };

    validate_array_length_hint(array, length);

    length
}

// Extracted into a standalone function to enable testing of bad hints.
fn validate_array_length_hint<T, let N: u32>(array: [T; N], length: u32)
where
    T: Empty,
{
    // Note: if length > N, the below `array` access will throw an out of bounds error.

    if length != N {
        array[length].assert_empty("Expected array[length] to be empty");
    }

    if length != 0 {
        assert(
            !array[length - 1].is_empty(),
            "Expected claimed final element of array (array[length - 1]) to be nonempty",
        );
    }
}

// Returns an array length defined by fully trimming _all_ "empty" items
// from the RHS.
pub unconstrained fn trimmed_array_length_hint<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty,
{
    let index_of_last_nonempty = find_last_index(array, |elem: T| !elem.is_empty());
    let length: u32 = if index_of_last_nonempty != N {
        1 + index_of_last_nonempty
    } else {
        0
    };
    length
}

// Returns the number of consecutive elements at the start of the array for which the predicate returns false.
// This function ensures that any element after the first matching element (predicate returns true) also matches the predicate.
pub fn array_length_until<T, let N: u32, Env>(array: [T; N], predicate: fn[Env](T) -> bool) -> u32 {
    let mut length = 0;
    let mut stop = false;
    for i in 0..N {
        if predicate(array[i]) {
            stop = true;
        } else {
            assert(
                stop == false,
                "non-matching element found after already encountering a matching element",
            );
            length += 1;
        }
    }
    length
}

pub fn check_permutation<T, let N: u32>(
    original_array: [T; N],
    permuted_array: [T; N],
    original_indexes: [u32; N],
)
where
    T: Eq,
{
    let mut seen_value = [false; N];
    for i in 0..N {
        let index = original_indexes[i];
        let original_value = original_array[index];
        assert(permuted_array[i].eq(original_value), "Invalid index");
        assert(!seen_value[index], "Duplicated index");
        seen_value[index] = true;
    }
}

/// Returns true iff every element of `array` at index `>= from_index` equals `padded_with`.
///
/// `from_index` must be a valid index into the array, i.e. `from_index <= N` (the boundary
/// `from_index == N` denotes a full prefix with no padding). Passing `from_index > N` is rejected:
/// otherwise this check would pass vacuously (the loop never reaches `from_index`), letting a caller
/// believe the array holds a `from_index`-length prefix followed by padding even though the array is
/// shorter than `from_index`.
pub fn array_padded_with<T, let N: u32>(array: [T; N], from_index: u32, padded_with: T) -> bool
where
    T: Eq,
{
    assert(from_index <= N, "from_index out of bounds");
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0..N {
        should_check |= i == from_index;
        is_valid &= !should_check | (array[i] == padded_with);
    }
    is_valid
}

// ==================== subarray tests ====================

#[test]
fn test_subarray() {
    assert_eq(subarray::<_, 5, 3>([10, 20, 30, 40, 50], 1), [20, 30, 40]);
    assert_eq(subarray::<_, 5, 2>([10, 20, 30, 40, 50], 0), [10, 20]);
    assert_eq(subarray::<_, 3, 0>([10, 20, 30], 2), []);
    assert_eq(subarray::<_, 3, 1>([10, 20, 30], 2), [30]);
}

#[test(should_fail_with = "out of bounds")]
fn test_subarray_offset_out_of_bounds() {
    let _: [Field; 1] = subarray([10, 20, 30], 5);
}

#[test(should_fail_with = "out of bounds")]
fn test_subarray_result_size_exceeds_available() {
    let _: [Field; 3] = subarray([10, 20, 30, 40, 50], 3);
}

// ==================== array_length tests ====================

#[test]
fn test_array_length_empty_array() {
    assert_eq(array_length([0]), 0);
    assert_eq(array_length([0, 0, 0]), 0);
}

#[test]
fn test_array_length() {
    assert_eq(array_length([123]), 1);
    assert_eq(array_length([123, 0, 0]), 1);
    assert_eq(array_length([123, 456]), 2);
    assert_eq(array_length([123, 456, 0]), 2);
}

#[test]
fn test_array_length_invalid_arrays() {
    // Result can be misleading (but correct) for invalid arrays.
    // This is why the arrays being passed-into `array_length` must already have been "validated"
    // (dense lhs, empty rhs).
    assert_eq(array_length([0, 0, 123]), 0);
    assert_eq(array_length([0, 123, 0]), 0);
    assert_eq(array_length([0, 123, 456]), 0);
    assert_eq(array_length([123, 0, 456]), 1);
}

// ==================== validate_array_length_hint tests ====================

#[test]
fn test_validate_array_length_hint_valid() {
    validate_array_length_hint([0, 0, 0], 0);
    validate_array_length_hint([10, 20, 0], 2);
    validate_array_length_hint([10, 20, 30], 3);
}

#[test(should_fail_with = "Expected array[length] to be empty")]
fn test_validate_array_length_hint_claims_zero_when_not_empty() {
    // Invalid: hint says length 0, but first element is not empty
    validate_array_length_hint([10, 20, 30], 0);
}

#[test(should_fail_with = "Expected array[length] to be empty")]
fn test_validate_array_length_hint_too_short() {
    // Invalid: hint says length 1, but element at index 1 is not empty
    validate_array_length_hint([10, 20, 0], 1);
}

#[test(should_fail_with = "Expected claimed final element of array (array[length - 1]) to be nonempty")]
fn test_validate_array_length_hint_too_long() {
    // Invalid: hint says length 2, but element at index 1 is empty
    validate_array_length_hint([10, 0, 0], 2);
}

#[test(should_fail_with = "Expected claimed final element of array (array[length - 1]) to be nonempty")]
fn test_validate_array_length_hint_of_empty_too_long() {
    // Invalid: hint says length 2, but element at index 1 is empty
    validate_array_length_hint([0, 0, 0], 2);
}

#[test(should_fail_with = "out of bounds")]
fn test_validate_array_length_hint_out_of_bounds() {
    // Invalid: hint says length 4, but array only has 3 elements
    validate_array_length_hint([10, 20, 30], 4);
}

// ==================== trimmed_array_length_hint tests ====================

#[test]
unconstrained fn test_trimmed_array_length_hint_with_trailing_empties() {
    assert_eq(trimmed_array_length_hint([10, 20, 30, 0, 0]), 3);
}

#[test]
unconstrained fn test_trimmed_array_length_hint_fully_empty() {
    assert_eq(trimmed_array_length_hint([0, 0, 0, 0, 0]), 0);
}

#[test]
unconstrained fn test_trimmed_array_length_hint_no_empties() {
    assert_eq(trimmed_array_length_hint([10, 20, 30, 40, 50]), 5);
}

#[test]
unconstrained fn test_trimmed_array_length_hint_with_gaps() {
    // Unlike array_length, this trims from the right only, so gaps don't matter
    assert_eq(trimmed_array_length_hint([10, 0, 30, 0, 0]), 3);
}

// ==================== array_length_until tests ====================

#[test]
fn test_array_length_until() {
    let array = [11, 22, 33, 44, 55];
    assert_eq(array_length_until(array, |x| x == 55), 4);
    assert_eq(array_length_until(array, |x| x == 56), 5);
    assert_eq(array_length_until(array, |x| x > 40), 3);
    assert_eq(array_length_until(array, |x| x > 10), 0);
}

#[test(should_fail_with = "non-matching element found after already encountering a matching element")]
fn test_array_length_until_non_consecutive_fails() {
    let array = [1, 1, 0, 1, 0];
    let _ = array_length_until(array, |x| x == 0);
}

#[test(should_fail_with = "non-matching element found after already encountering a matching element")]
fn test_array_length_until_first_non_matching_fails() {
    let array = [1, 0, 0, 0, 0];
    let _ = array_length_until(array, |x| x == 1);
}

// ==================== check_permutation tests ====================

#[test]
fn test_check_permutation() {
    let original_array = [1, 2, 3];
    let permuted_array = [3, 1, 2];
    let indexes = [2, 0, 1];
    check_permutation(original_array, permuted_array, indexes);
}

#[test(should_fail_with = "Duplicated index")]
fn test_check_permutation_duplicated_index() {
    let original_array = [0, 1, 0];
    let permuted_array = [1, 0, 0];
    let indexes = [1, 0, 0];
    check_permutation(original_array, permuted_array, indexes);
}

#[test(should_fail_with = "Invalid index")]
fn test_check_permutation_invalid_index() {
    let original_array = [0, 1, 2];
    let permuted_array = [1, 0, 0];
    let indexes = [1, 0, 2];
    check_permutation(original_array, permuted_array, indexes);
}

// ==================== array_padded_with tests ====================

#[test]
fn test_array_padded_with() {
    let array = [11, 22, 33, 44, 44];
    assert_eq(array_padded_with(array, 0, 44), false);
    assert_eq(array_padded_with(array, 1, 44), false);
    assert_eq(array_padded_with(array, 2, 44), false);
    assert_eq(array_padded_with(array, 3, 44), true);
    assert_eq(array_padded_with(array, 4, 44), true);
    assert_eq(array_padded_with(array, 4, 33), false);
    assert_eq(array_padded_with(array, 5, 44), true); // from_index == N: full prefix, no padding.
    assert_eq(array_padded_with(array, 0, 11), false);
}

#[test(should_fail_with = "from_index out of bounds")]
fn test_array_padded_with_from_index_out_of_bounds() {
    let array = [11, 22, 33, 44, 44];
    let _ = array_padded_with(array, 6, 44);
}

#[test]
fn test_array_padded_with_single_element() {
    // N == 1: from_index 0 checks the whole array; from_index 1 (== N) is the no-padding boundary.
    assert_eq(array_padded_with([7], 0, 7), true);
    assert_eq(array_padded_with([7], 0, 8), false);
    assert_eq(array_padded_with([7], 1, 8), true);
}

#[test]
fn test_array_padded_with_requires_all_tail_padded() {
    // Padding must hold for every index >= from_index, not just the first one.
    let array = [1, 2, 9, 9, 9];
    assert_eq(array_padded_with(array, 2, 9), true);
    assert_eq(array_padded_with(array, 1, 9), false); // index 1 (value 2) != 9
    let broken_tail = [1, 2, 9, 8, 9];
    assert_eq(array_padded_with(broken_tail, 2, 9), false); // index 3 (value 8) != 9
    // from_index == 0 requires the whole array to equal the pad value.
    assert_eq(array_padded_with([9, 9, 9], 0, 9), true);
    assert_eq(array_padded_with([9, 9, 8], 0, 9), false);
}

#[test(should_fail_with = "from_index out of bounds")]
fn test_array_padded_with_from_index_far_out_of_bounds() {
    let array = [11, 22, 33, 44, 44];
    let _ = array_padded_with(array, 100, 44);
}
