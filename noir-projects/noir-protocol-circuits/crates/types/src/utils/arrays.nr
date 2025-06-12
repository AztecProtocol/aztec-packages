pub mod assert_array_appended;
pub mod assert_array_prepended;
pub mod assert_exposed_sorted_transformed_value_array;
pub mod assert_sorted_array;
pub mod assert_sorted_transformed_padded_array;
pub mod assert_split_sorted_transformed_value_arrays;
pub mod assert_split_transformed_padded_arrays;
pub mod assert_split_transformed_value_arrays;
pub mod get_sorted_result;
pub mod get_sorted_tuple;
pub mod sort_by;
pub mod sort_by_counter;

// Re-exports.
pub use assert_array_appended::{
    assert_array_appended, assert_array_appended_and_scoped,
    assert_array_appended_reversed_to_empty_dest, assert_array_appended_reversed_up_to_some_length,
    assert_array_appended_scoped, assert_array_appended_to_empty_dest,
    assert_array_appended_to_empty_dest_and_scoped, assert_array_appended_to_empty_dest_scoped,
};
pub use assert_array_prepended::{assert_array_prepended, assert_array_prepended_up_to_some_length};
pub use assert_exposed_sorted_transformed_value_array::{
    assert_exposed_sorted_transformed_value_array,
    get_order_hints::{get_order_hints_asc, OrderHint},
};
pub use assert_sorted_array::assert_sorted_array;
pub use assert_sorted_transformed_padded_array::{
    assert_sorted_transformed_i_padded_array_capped_size,
    assert_sorted_transformed_padded_array_capped_size, validate_padded_items,
};
pub use assert_split_sorted_transformed_value_arrays::{
    assert_split_sorted_transformed_value_arrays_asc,
    get_split_order_hints::{get_split_order_hints_asc, SplitOrderHints},
};
pub use assert_split_transformed_padded_arrays::assert_split_transformed_padded_arrays;
pub use get_sorted_result::{get_sorted_result, SortedResult};
pub use sort_by_counter::sort_by_counter_asc;

use crate::traits::Empty;
use super::for_loop::{for_i_in_, for_i_in_0_, for_loop_no_op};

//**********************************************************************************
// ARRAY
//**********************************************************************************

// TODO: Consider making this a part of the noir stdlib.
pub fn subarray<let SRC_LEN: u32, let DST_LEN: u32>(
    src: [Field; SRC_LEN],
    offset: u32,
) -> [Field; DST_LEN] {
    let mut dst: [Field; DST_LEN] = std::mem::zeroed();
    for i in 0..DST_LEN {
        dst[i] = src[i + offset];
    }

    dst
}

// Helper function to find the index of the first element in an array that satisfies a given predicate.
// If the element is not found, the function returns Option::none.
// TODO: Consider making this a part of the noir stdlib.
pub unconstrained fn find_index_hint<T, let N: u32, Env>(
    array: [T; N],
    find: fn[Env](T) -> bool,
) -> Option<u32> {
    let mut index: Option<u32> = Option::none();
    for i in 0..N {
        if find(array[i]) {
            index = Option::some(i);
            break;
        }
    }
    index
}

// Helper function to find the index of the first element (starting from the back) of an array that satisfies a given predicate.
// If the element is not found, the function returns Option::none.
// TODO: Consider making this a part of the noir stdlib.
pub unconstrained fn find_index_hint_in_reverse<T, let N: u32, Env>(
    array: [T; N],
    find: fn[Env](T) -> bool,
) -> Option<u32> {
    let mut index: Option<u32> = Option::none();
    for i in 0..N {
        let j = N - i - 1;
        if find(array[j]) {
            index = Option::some(j);
            break;
        }
    }
    index
}

// Helper fn to create a subarray from a given array
// TODO: rename to `slice`. This is not a splice.
pub fn array_splice<T, let N: u32, let M: u32>(array: [T; N], offset: u32) -> [T; M]
where
    T: Empty,
{
    let mut result: [T; M] = [T::empty(); M];
    for i in 0..M {
        result[i] = array[offset + i];
    }
    result
}

//**********************************************************************************
// TO DELETE
//**********************************************************************************

/// Deprecated.
///
/// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
/// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
/// valid.
pub fn validate_array<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty,
{
    let mut seen_empty = false;
    let mut length = 0;
    for i in 0..N {
        if array[i].is_empty() {
            seen_empty = true;
        } else {
            assert_eq(seen_empty, false, "invalid array");
            length += 1;
        }
    }
    length
}

/// Deprecated.
///
/// Helper function to count the number of non-empty elements in a validated array.
/// Important: Only use it for validated arrays where validate_array(array) returns true,
/// which ensures that:
/// 1. All elements before the first empty element are non-empty
/// 2. All elements after and including the first empty element are empty
/// 3. The array forms a contiguous sequence of non-empty elements followed by empty elements
pub fn array_length<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty,
{
    // We get the length by checking the index of the first empty element.

    // Safety: This is safe because we have validated the array (see function doc above) and the emptiness
    // of the element and non-emptiness of the previous element is checked below.
    let maybe_length = unsafe { find_index_hint(array, |elem: T| elem.is_empty()) };

    let mut length = 0;
    if maybe_length.is_some() {
        let length = maybe_length.unwrap_unchecked();

        array[length].assert_empty("Expected array empty");

        if length != 0 {
            assert(!array[length - 1].is_empty());
        }
    }

    length
}

unconstrained fn trimmed_array_length_hint<T, let N: u32>(array: [T; N]) -> u32
where
    T: Empty,
{
    let maybe_index_of_last_nonempty =
        find_index_hint_in_reverse(array, |elem: T| !elem.is_empty());
    let length: u32 = if maybe_index_of_last_nonempty.is_some() {
        1 + maybe_index_of_last_nonempty.unwrap_unchecked()
    } else {
        0
    };
    length
}

/// This function assumes that `array1` and `array2` contain no more than N non-empty elements between them,
/// if this is not the case then elements from the end of `array2` will be dropped.
pub fn array_merge<T, let N: u32>(array1: [T; N], array2: [T; N]) -> [T; N]
where
    T: Empty,
{
    // Safety: we constrain this array below
    let result = unsafe { array_merge_helper(array1, array2) };
    // We assume arrays have been validated. The only use cases so far are with previously validated arrays.
    let array1_len = array_length(array1);
    let mut add_from_left = true;
    for i in 0..N {
        add_from_left &= i != array1_len;
        if add_from_left {
            assert_eq(result[i], array1[i]);
        } else {
            assert_eq(result[i], array2[i - array1_len]);
        }
    }
    result
}

unconstrained fn array_merge_helper<T, let N: u32>(array1: [T; N], array2: [T; N]) -> [T; N]
where
    T: Empty,
{
    let mut result: [T; N] = [T::empty(); N];
    let mut i = 0;
    for elem in array1 {
        if !elem.is_empty() {
            result[i] = elem;
            i += 1;
        }
    }
    for elem in array2 {
        if !elem.is_empty() {
            result[i] = elem;
            i += 1;
        }
    }
    result
}

// Helper function to convert a validated array to BoundedVec.
// Important: Only use it for validated arrays: validate_array(array) should be true.
pub unconstrained fn array_to_bounded_vec<T, let N: u32>(array: [T; N]) -> BoundedVec<T, N>
where
    T: Empty,
{
    let len = array_length(array);
    BoundedVec::from_parts_unchecked(array, len)
}

//**********************************************************************************
// ARRAY WRAPPERS
//**********************************************************************************

/*
 *
 *
 *                                                                                                    
 *                          |-----------------------------------------|------------------------------| 
 *                          | LHS                                     | RHS                          |
 *                          |-----------------------------------------|------------------------------|
 * AppendedUnvalidatedArray | Interspersed 0s possible.               | Unvalidated.                 |
 *                          | Possibly not fully trimmed.             | Nonempty elements possible.  |
 *                          |-----------------------------------------|------------------------------|
 *            EmptyRHSArray | Interspersed 0s possible.               | All 0s (validated).          |
 *                          | Possibly not fully trimmed.             |                              |
 *                          |-----------------------------------------|------------------------------|
 *             TrimmedArray | Interspersed 0s possible.               | All 0s (validated)           |
 *                          | Last lhs element validated as nonempty. |                              |
 *                          | (I.e. fully trimmed)                    |                              |
 *                          |-----------------------------------------|------------------------------|
 *        DenseTrimmedArray | Dense (validated).                      | All 0s (validated)           |
 *                          |-----------------------------------------|------------------------------|
 *
 *
 *                          | What guarantees do we have?                      |
 *                          |--------|--------|--------------------------------| 
 *                          | Dense? | RHS    | Length vs Fully Trimmed Length |
 *                          |--------|--------|--------------------------------|
 * AppendedUnvalidatedArray | ?      | ?      | ?                              |
 *                          |        |        |                                |
 *                          |--------|--------|--------------------------------|
 *            EmptyRHSArray | ?      | All 0s | Length >= Fully Trimmed Length |
 *                          |        |        |                                |
 *                          |--------|--------|--------------------------------|
 *             TrimmedArray | ?      | All 0s | Length == Fully Trimmed Length |
 *                          |        |        |                                |
 *                          |        |        |                                |
 *                          |--------|--------|--------------------------------|
 *        DenseTrimmedArray | Yes    | All 0s | Length == Fully Trimmed Length |
 *                          |--------|--------|--------------------------------|
 *
 *
 * An AppendedUnvalidatedArray is distinct from a regular array [T; N], because it carries a validated length.
 *
 *
 * Possible routes towards eventually fully-constraining an array:
 * 
 * [T; N] -----> EmptyRHSArray --(splice into)-----> AppendedUnvalidatedArray 
 *   | |               |                                        |
 *   | |               v                                        |
 *   |  ---------------------------> TrimmedArray               |
 *   |                                   |                      |
 *   |                                   v                      v
 *    ------------------------------------------------------------------------> DenseTrimmedArray
 *
 * 
 */

/// A EmptyRHSArray is a wrapped array whose `length` hint has been validated
/// (constrained) to be correct, insofar as all elements _after_ the claimed length are empty.
/// The `length` is defined as the length of the array ignoring some number of trailing `0`s.
/// We don't validate that it's necessarily _fully_ trimmed, because that costs more constraints:
/// see `TrimmedArray` for a guaranteed-to-be-fully-trimmed array.
///
/// Importantly, the "left part" of a EmptyRHSArray _can_ contain interspersed `0` elements.
/// [3, 3, 3, 3, 3, 0, 0, 0] <-- length = 5 or 6 or 7 or 8
/// [3, 0, 0, 3, 3, 0, 0, 0] <-- length = 5 or 6 or 7 or 8
/// [3, 3, 3, 3, 3, 3, 3, 3] <-- length = 8
/// [0, 0, 0, 0, 0, 0, 0, 0] <-- length = 0 or 1 or 2 or 3 or 4 or 5 or 6 or 7 or 8
///
/// Notice: any array can be converted into a valid EmptyRHSArray. There are no restrictions.
#[derive(Eq)]
pub struct EmptyRHSArray<T, let N: u32> {
    pub array: [T; N],
    pub length: u32,
}

/// A TrimmedArray is a wrapped array whose `length` hint has been validated
/// (constrained) to be correct.
/// The `length` is defined as the length of the array ignoring _all_ trailing `0`s.
///
/// Importantly, the "left part" of a TrimmedArray _can_ contain interspersed `0` elements.
/// [3, 3, 3, 3, 3, 0, 0, 0] <-- length = 5 exactly.
/// [3, 0, 0, 3, 3, 0, 0, 0] <-- length = 5 exactly.
/// [3, 3, 3, 3, 3, 3, 3, 3] <-- length = 8 exactly.
/// [0, 0, 0, 0, 0, 0, 0, 0] <-- length = 0 exactly.
///
/// Notice: any array can be converted into a valid TrimmedArray. There are no restrictions.
#[derive(Eq)]
pub struct TrimmedArray<T, let N: u32> {
    pub array: [T; N],
    pub length: u32,
}

/// A DenseTrimmedArray is a wrapped array where:
/// - nonempty elements are tightly-packed to the left (with no interspersed `0`s).
/// - the `length` hint has been validated (constrained) to be correct.
/// The `length` is defined as the length of the array ignoring _all_ trailing `0`s.
///
/// Importantly, the "left part" of a EmptyRHSArray _can_ contain interspersed `0` elements.
/// [3, 3, 3, 3, 3, 0, 0, 0] <-- length = 5 exactly
/// [3, 0, 0, 3, 3, 0, 0, 0] <-- THROWS, because of the interspersed 0's. It is not left-packed.
/// [3, 3, 3, 3, 3, 3, 3, 3] <-- length = 8 exactly
/// [0, 0, 0, 0, 0, 0, 0, 0] <-- length = 0 exactly
///
/// Notice: not every array can be converted into a DenseTrimmedArray; it must be left-packed!
#[derive(Eq)]
pub struct DenseTrimmedArray<T, let N: u32> {
    pub array: [T; N],
    pub length: u32,
}

/// AppendedUnvalidatedArray - A weird one: Created by iteratively splicing EmptyRHSArrays into an (Unvalidated) array.
/// It's not a completely unvalidated array, because with each splicing, we correctly sum together lengths of the spliced-in arrays.
/// We know that none of the source data (of the spliced-in EmptyRHSArrays) gets lost, because length >= trimmed length.
/// We defer validating that the AppendedUnvalidatedArray is dense and trimmed until a later circuit.
// #[derive(Eq)]
pub struct AppendedUnvalidatedArray<T, let N: u32> {
    pub array: [T; N],
    pub length: u32,
}

impl<T, let N: u32> EmptyRHSArray<T, N>
where
    T: Empty,
{
    pub fn new(array: [T; N]) -> Self {
        let length = Self::empty_rhs_array_length(array);
        // The the array has been validated to be empty beyond its length. Return a type which makes this validation evident:
        EmptyRHSArray { array, length }
    }

    fn empty_rhs_array_length(array: [T; N]) -> u32 {
        // Safety: the hint is validated immediately below.
        let trimmed_array_length_hint = unsafe { trimmed_array_length_hint(array) };
        Self::validate_empty_rhs(array, trimmed_array_length_hint);
        let validated_trimmed_array_length = trimmed_array_length_hint;
        validated_trimmed_array_length
    }

    fn validate_empty_rhs(array: [T; N], length_hint: u32) {
        for_i_in_(
            length_hint,
            N,
            0,
            N,
            for_loop_no_op,
            |i| { array[i].assert_empty("Array should be all zeros after its 'length'"); },
            for_loop_no_op,
            true,
            false,
        );
    }
}

impl<T, let N: u32> TrimmedArray<T, N>
where
    T: Empty,
{
    pub fn new(array: [T; N]) -> Self {
        // We leverage that a rhs-empty array already has its rhs validated to be empty.
        let empty_rhs_array = EmptyRHSArray::new(array);
        Self::new_from_empty_rhs_array(empty_rhs_array)
    }

    /// Requires the length of the EmptyRHSArray to actually
    /// be the fully_trimmed_length (which will always be the case unless the prover
    /// is meddling with the unconstrained functions) or it will throw.
    pub fn new_from_empty_rhs_array(empty_rhs_array: EmptyRHSArray<T, N>) -> Self {
        Self::validate_fully_trimmed(empty_rhs_array);
        Self { array: empty_rhs_array.array, length: empty_rhs_array.length }
    }

    // Asserting not empty can cost constraints, so we try to call it infrequently.
    fn validate_fully_trimmed(arr: EmptyRHSArray<T, N>) {
        // A rhs-empty array is actually _fully_ trimmed if its "last" element
        // (measured according to the length) is nonempty.
        if arr.length != 0 {
            arr.array[arr.length - 1].assert_not_empty(); // "Input array is not fully trimmed");
        }
    }
}

impl<T, let N: u32> DenseTrimmedArray<T, N>
where
    T: Empty,
{
    // Used to be called `validate_array`
    pub fn new(array: [T; N]) -> Self {
        // Safety: validated immediately below.
        let trimmed_array_length_hint = unsafe { trimmed_array_length_hint(array) };
        Self::assert_dense_trimmed(array, trimmed_array_length_hint);
        DenseTrimmedArray { array, length: trimmed_array_length_hint }
    }

    pub fn new_from_appended_unvalidated_array(array: AppendedUnvalidatedArray<T, N>) -> Self {
        Self::assert_dense_trimmed(array.array, array.length);
        DenseTrimmedArray { array: array.array, length: array.length }
    }

    fn assert_dense_trimmed(array: [T; N], length_hint: u32) {
        for_i_in_0_(
            length_hint,
            array.len(),
            |i| {
                array[i].assert_not_empty(); // LHS of input array is not dense.
            },
            |i| array[i].assert_empty("RHS of input array is not empty"),
            false,
        );
    }

    pub unconstrained fn to_bounded_vec(self) -> BoundedVec<T, N> {
        BoundedVec::from_parts_unchecked(self.array, self.length)
    }
}

impl<T, let N: u32> AppendedUnvalidatedArray<T, N>
where
    T: Empty,
{
    // No constructor. Append to an empty one.

    // For constrained append functions, see the dedicated file: assert_array_appended.nr

    pub fn push(&mut self, item: T) {
        assert(self.length != N, "Array full");

        let mut next_index = self.length;
        self.array[next_index] = item;
        self.length += 1;
    }

    pub fn assert_dense_trimmed(self) -> DenseTrimmedArray<T, N> {
        DenseTrimmedArray::new_from_appended_unvalidated_array(self)
    }

    pub fn assert_empty<let S: u32>(self, msg: str<S>) -> DenseTrimmedArray<T, N> {
        for i in 0..N {
            self.array[i].assert_empty(msg);
        }
        assert_eq(self.length, 0);

        DenseTrimmedArray { array: self.array, length: self.length }
    }

    pub unconstrained fn push_hint(&mut self, item: T) {
        assert(self.length != N, "Array full");

        let mut next_index = self.length;
        self.array[next_index] = item;
        self.length += 1;
    }

    pub unconstrained fn pop_hint(&mut self) -> T {
        assert(self.length != 0, "Array empty");

        let mut top_index = self.length - 1;
        let popped_item = self.array[top_index];
        self.array[top_index] = T::empty();
        self.length -= 1;
        popped_item
    }
    // pub unconstrained fn reverse(self) -> Self {
    //     let mut reversed = Self::empty();
    //     let length = self.length;
    //     for i in 0..N {
    //         if i < length {
    //             reversed.push_hint(self.array[length - i - 1]);
    //         }
    //     }
    //     reversed
    // }
}

// Q: no idea why this is needed, if we have #[derive(Eq)] above the struct definition.
impl<T, let N: u32> Eq for AppendedUnvalidatedArray<T, N>
where
    T: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.array == other.array) & (self.length == other.length)
    }
}

impl<T, let N: u32> Empty for AppendedUnvalidatedArray<T, N>
where
    T: Empty + Eq,
{
    fn empty() -> Self {
        Self { array: [T::empty(); N], length: 0 }
    }
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
                "matching element found after already encountering a non-matching element",
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
    T: Empty,
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

// TODO: subsume into the wrapped array structs above, somehow.
// Helper function to check if an array is padded with a given value from a given index.
// Different to padded_array_length in that it allows the elements before the given index to be the same as the padded value.
pub fn array_padded_with<T, let N: u32>(array: [T; N], from_index: u32, padded_with: T) -> bool
where
    T: Eq,
{
    let mut is_valid = true;
    let mut should_check = false;
    for i in 0..N {
        should_check |= i == from_index;
        is_valid &= !should_check | (array[i] == padded_with);
    }
    is_valid
}

#[test]
fn smoke_left_packed_array() {
    let valid_array: [Field; 0] = [];
    assert(DenseTrimmedArray::new(valid_array).length == 0);

    let valid_array = [0];
    assert(DenseTrimmedArray::new(valid_array).length == 0);

    let valid_array = [3];
    assert(DenseTrimmedArray::new(valid_array).length == 1);

    let valid_array = [1, 2, 3];
    assert(DenseTrimmedArray::new(valid_array).length == 3);

    let valid_array = [1, 2, 3, 0];
    assert(DenseTrimmedArray::new(valid_array).length == 3);

    let valid_array = [1, 2, 3, 0, 0];
    assert(DenseTrimmedArray::new(valid_array).length == 3);
}

#[test]
fn smoke_trimmed_array() {
    let valid_array: [Field; 0] = [];
    assert(TrimmedArray::new(valid_array).length == 0);

    let valid_array = [0];
    assert(TrimmedArray::new(valid_array).length == 0);

    let valid_array = [3];
    assert(TrimmedArray::new(valid_array).length == 1);

    let valid_array = [1, 0, 3];
    assert(TrimmedArray::new(valid_array).length == 3);

    let valid_array = [1, 0, 3, 0];
    assert(TrimmedArray::new(valid_array).length == 3);

    let valid_array = [1, 2, 3, 0, 0];
    assert(TrimmedArray::new(valid_array).length == 3);

    let valid_array = [0, 0, 3, 0, 0];
    assert(TrimmedArray::new(valid_array).length == 3);
}

#[test]
fn smoke_somewhat_trimmed_array() {
    let valid_array: [Field; 0] = [];
    assert(EmptyRHSArray::new(valid_array).length == 0);

    let valid_array = [0];
    assert(EmptyRHSArray::new(valid_array).length == 0);

    let valid_array = [3];
    assert(EmptyRHSArray::new(valid_array).length == 1);

    let valid_array = [1, 0, 3];
    assert(EmptyRHSArray::new(valid_array).length == 3);

    let valid_array = [1, 0, 3, 0];
    assert(EmptyRHSArray::new(valid_array).length == 3);

    let valid_array = [1, 2, 3, 0, 0];
    assert(EmptyRHSArray::new(valid_array).length == 3);

    let valid_array = [0, 0, 3, 0, 0];
    assert(EmptyRHSArray::new(valid_array).length == 3);
}

#[test(should_fail)]
fn smoke_left_packed_array_invalid_case0() {
    let invalid_array = [0, 1];
    let _ = DenseTrimmedArray::new(invalid_array);
}

#[test(should_fail)]
fn smoke_left_packed_array_invalid_case1() {
    let invalid_array = [1, 0, 0, 1, 0];
    let _ = DenseTrimmedArray::new(invalid_array);
}

#[test(should_fail)]
fn smoke_left_packed_array_invalid_case2() {
    let invalid_array = [0, 0, 0, 0, 1];
    let _ = DenseTrimmedArray::new(invalid_array);
}

#[test]
fn test_empty_left_packed_array_length() {
    assert_eq(DenseTrimmedArray::new([0]).length, 0);
    assert_eq(DenseTrimmedArray::new([0, 0, 0]).length, 0);
}

#[test]
fn test_array_length() {
    assert_eq(DenseTrimmedArray::new([123]).length, 1);
    assert_eq(DenseTrimmedArray::new([123, 0, 0]).length, 1);
    assert_eq(DenseTrimmedArray::new([123, 456]).length, 2);
    assert_eq(DenseTrimmedArray::new([123, 456, 0]).length, 2);
}

// #[test]
// fn test_array_length_invalid_arrays() {
//     // Result can be misleading (but correct) for invalid arrays.
//     assert_eq(array_length([0, 0, 123]), 0);
//     assert_eq(array_length([0, 123, 0]), 0);
//     assert_eq(array_length([0, 123, 456]), 0);
//     assert_eq(array_length([123, 0, 456]), 1);
// }

#[test]
fn test_array_length_until() {
    let array = [11, 22, 33, 44, 55];
    assert_eq(array_length_until(array, |x| x == 55), 4);
    assert_eq(array_length_until(array, |x| x == 56), 5);
    assert_eq(array_length_until(array, |x| x > 40), 3);
    assert_eq(array_length_until(array, |x| x > 10), 0);
}

#[test(should_fail_with = "matching element found after already encountering a non-matching element")]
fn test_array_length_until_non_consecutive_fails() {
    let array = [1, 1, 0, 1, 0];
    let _ = array_length_until(array, |x| x == 0);
}

#[test(should_fail_with = "matching element found after already encountering a non-matching element")]
fn test_array_length_until_first_non_matching_fails() {
    let array = [1, 0, 0, 0, 0];
    let _ = array_length_until(array, |x| x == 1);
}

#[test]
unconstrained fn find_index_greater_than_min() {
    let values = [10, 20, 30, 40];
    let min = 22;
    let maybe_index = find_index_hint(values, |v: Field| min.lt(v));
    assert_eq(maybe_index.unwrap_unchecked(), 2);
}

#[test]
unconstrained fn find_index_not_found() {
    let values = [10, 20, 30, 40];
    let min = 100;
    let maybe_index = find_index_hint(values, |v: Field| min.lt(v));
    assert_eq(maybe_index.unwrap_unchecked(), 4);
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

#[test]
fn test_array_padded_with() {
    let array = [11, 22, 33, 44, 44];
    assert_eq(array_padded_with(array, 0, 44), false);
    assert_eq(array_padded_with(array, 1, 44), false);
    assert_eq(array_padded_with(array, 2, 44), false);
    assert_eq(array_padded_with(array, 3, 44), true);
    assert_eq(array_padded_with(array, 4, 44), true);
    assert_eq(array_padded_with(array, 4, 33), false);
    assert_eq(array_padded_with(array, 5, 44), true); // Index out of bounds.
    assert_eq(array_padded_with(array, 0, 11), false);
}
