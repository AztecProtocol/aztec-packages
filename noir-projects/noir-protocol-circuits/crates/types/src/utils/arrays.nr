pub mod assert_array_appended;
pub mod assert_array_prepended;
pub mod assert_combined_array;
pub mod assert_combined_transformed_array;
pub mod assert_exposed_sorted_transformed_value_array;
pub mod assert_sorted_array;
pub mod assert_sorted_transformed_value_array;
pub mod assert_split_sorted_transformed_value_arrays;
pub mod assert_split_transformed_value_arrays;
pub mod get_sorted_result;
pub mod get_sorted_tuple;
pub mod sort_by;
pub mod sort_by_counter;

// Re-exports.
pub use assert_array_appended::{
    assert_array_appended, assert_array_appended_and_scoped, assert_array_appended_reversed,
    assert_array_appended_scoped,
};
pub use assert_array_prepended::assert_array_prepended;
pub use assert_combined_array::{assert_combined_array, combine_arrays};
pub use assert_combined_transformed_array::{
    assert_combined_transformed_array, combine_and_transform_arrays,
};
pub use assert_exposed_sorted_transformed_value_array::{
    assert_exposed_sorted_transformed_value_array,
    get_order_hints::{get_order_hints_asc, get_order_hints_desc, OrderHint},
};
pub use assert_sorted_array::assert_sorted_array;
pub use assert_sorted_transformed_value_array::{
    assert_sorted_transformed_value_array, assert_sorted_transformed_value_array_capped_size,
};
pub use assert_split_sorted_transformed_value_arrays::{
    assert_split_sorted_transformed_value_arrays_asc,
    assert_split_sorted_transformed_value_arrays_desc,
    get_split_order_hints::{get_split_order_hints_asc, get_split_order_hints_desc, SplitOrderHints},
};
pub use assert_split_transformed_value_arrays::assert_split_transformed_value_arrays;
pub use get_sorted_result::{get_sorted_result, SortedResult};
pub use sort_by_counter::{sort_by_counter_asc, sort_by_counter_desc};

use crate::traits::{Empty, is_empty};

pub fn subarray<let SRC_LEN: u32, let DST_LEN: u32>(
    src: [Field; SRC_LEN],
    offset: u32,
) -> [Field; DST_LEN] {
    assert(offset + DST_LEN <= SRC_LEN, "offset too large");

    let mut dst: [Field; DST_LEN] = std::mem::zeroed();
    for i in 0..DST_LEN {
        dst[i] = src[i + offset];
    }

    dst
}

// Helper function to convert a validated array to BoundedVec.
// Important: Only use it for validated arrays: validate_array(array) should be true.
pub unconstrained fn array_to_bounded_vec<T, let N: u32>(array: [T; N]) -> BoundedVec<T, N>
where
    T: Empty + Eq,
{
    let len = array_length(array);
    BoundedVec::from_parts_unchecked(array, len)
}

pub unconstrained fn find_index_hint<T, let N: u32, Env>(
    array: [T; N],
    find: fn[Env](T) -> bool,
) -> u32 {
    let mut index = N;
    for i in 0..N {
        if (index == N) & find(array[i]) {
            index = i;
        }
    }
    index
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
pub fn validate_array<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty + Eq,
{
    let mut seen_empty = false;
    let mut length = 0;
    for i in 0..N {
        if is_empty(array[i]) {
            seen_empty = true;
        } else {
            assert(seen_empty == false, "invalid array");
            length += 1;
        }
    }
    length
}

// Helper function to count the number of non-empty elements in a validated array.
// Important: Only use it for validated arrays: validate_array(array) should be true.
pub fn array_length<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty + Eq,
{
    let length = unsafe { find_index_hint(array, |elem: T| is_empty(elem)) };
    if length != 0 {
        assert(!is_empty(array[length - 1]));
    }
    if length != N {
        assert(is_empty(array[length]));
    }
    length
}

pub fn array_concat<T, let N: u32, let M: u32>(array1: [T; N], array2: [T; M]) -> [T; N + M] {
    let mut result = [array1[0]; N + M];
    for i in 1..N {
        result[i] = array1[i];
    }
    for i in 0..M {
        result[i + N] = array2[i];
    }
    result
}

pub fn array_merge<T, let N: u32>(array1: [T; N], array2: [T; N]) -> [T; N]
where
    T: Empty + Eq,
{
    let mut result: [T; N] = [T::empty(); N];
    let mut i = 0;
    for elem in array1 {
        if !is_empty(elem) {
            result[i] = elem;
            i += 1;
        }
    }
    for elem in array2 {
        if !is_empty(elem) {
            result[i] = elem;
            i += 1;
        }
    }
    result
}

// Helper fn to create a subarray from a given array
pub fn array_splice<T, let N: u32, let M: u32>(array: [T; N], offset: u32) -> [T; M]
where
    T: Empty,
{
    assert(M + offset <= N, "Subarray length larger than array length");
    let mut result: [T; M] = [T::empty(); M];
    for i in 0..M {
        result[i] = array[offset + i];
    }
    result
}

pub fn check_permutation<T, let N: u32>(
    original_array: [T; N],
    permuted_array: [T; N],
    original_indexes: [u32; N],
)
where
    T: Eq + Empty,
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

#[test]
fn smoke_validate_array() {
    let valid_array: [Field; 0] = [];
    assert(validate_array(valid_array) == 0);

    let valid_array = [0];
    assert(validate_array(valid_array) == 0);

    let valid_array = [3];
    assert(validate_array(valid_array) == 1);

    let valid_array = [1, 2, 3];
    assert(validate_array(valid_array) == 3);

    let valid_array = [1, 2, 3, 0];
    assert(validate_array(valid_array) == 3);

    let valid_array = [1, 2, 3, 0, 0];
    assert(validate_array(valid_array) == 3);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid_case0() {
    let invalid_array = [0, 1];
    let _ = validate_array(invalid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid_case1() {
    let invalid_array = [1, 0, 0, 1, 0];
    let _ = validate_array(invalid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid_case2() {
    let invalid_array = [0, 0, 0, 0, 1];
    let _ = validate_array(invalid_array);
}

#[test]
fn test_empty_array_length() {
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
    assert_eq(array_length([0, 0, 123]), 0);
    assert_eq(array_length([0, 123, 0]), 0);
    assert_eq(array_length([0, 123, 456]), 0);
    assert_eq(array_length([123, 0, 456]), 1);
}

#[test]
fn find_index_greater_than_min() {
    let values = [10, 20, 30, 40];
    let min = 22;
    let index = unsafe { find_index_hint(values, |v: Field| min.lt(v)) };
    assert_eq(index, 2);
}

#[test]
fn find_index_not_found() {
    let values = [10, 20, 30, 40];
    let min = 100;
    let index = unsafe { find_index_hint(values, |v: Field| min.lt(v)) };
    assert_eq(index, 4);
}

#[test]
fn test_array_concat() {
    let array0 = [1, 2, 3];
    let array1 = [4, 5];
    let concated = array_concat(array0, array1);
    assert_eq(concated, [1, 2, 3, 4, 5]);
}

#[test]
fn check_permutation_basic_test() {
    let original_array = [1, 2, 3];
    let permuted_array = [3, 1, 2];
    let indexes = [2, 0, 1];
    check_permutation(original_array, permuted_array, indexes);
}

#[test(should_fail_with = "Duplicated index")]
fn check_permutation_duplicated_index() {
    let original_array = [0, 1, 0];
    let permuted_array = [1, 0, 0];
    let indexes = [1, 0, 0];
    check_permutation(original_array, permuted_array, indexes);
}

#[test(should_fail_with = "Invalid index")]
fn check_permutation_invalid_index() {
    let original_array = [0, 1, 2];
    let permuted_array = [1, 0, 0];
    let indexes = [1, 0, 2];
    check_permutation(original_array, permuted_array, indexes);
}
