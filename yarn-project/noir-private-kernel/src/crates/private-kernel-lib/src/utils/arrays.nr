use crate::abis::new_contract_data::NewContractData;
use dep::std::array;
use crate::utils::bounded_vec::BoundedVec;

// Trait: is_empty
//
// We manually monomorphize the is_empty trait as its a bit simpler 
// and the complexity is localized to this utils package.
//
// The general is_empty trait checks if a data type is is empty,
// and it defines empty for the basic data types as 0.
//
// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic 
// if a value can actually be zero. In a future refactor, we can 
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
pub fn is_empty_array<T>(array : [Field; T]) -> bool {
    array.all(|elem| is_empty(elem))
}
pub fn is_empty(value : Field) -> bool {
    value == 0
}
pub fn log_hashes_empty(log_hashes : [Field; 2]) -> bool {
    log_hashes.all(|elem| elem == 0)
}
pub fn is_empty_single_field<T>(field : Field) -> bool {
    field == 0
}

// TODO: This will be replaced with BoundedVec-- we want an as close copy as possible
// initially.
//
// Push a field into the next empty slot in the array
pub fn array_push_field<T>(mut array : [Field; T], value_to_push : Field) -> [Field; T] {
    let mut found_empty_slot = false;
    for index in 0..array.len() {
        if (array[index] == 0) && (found_empty_slot == false) {
            found_empty_slot = true;
            array[index] = value_to_push;
        }
    }
    assert(found_empty_slot, "array has reached maximum capacity");
    array
}


// This is being copied due to us not having traits
// I've decided to localize this tech debt, as its easier to copy and paste
// rather than using first class functions.
pub fn array_push_new_contract_data<T>(mut array : [NewContractData; T], value_to_push : NewContractData) -> [NewContractData; T] {
    let mut found_empty_slot = false;
    for index in 0..array.len() {
        if (array[index].is_empty()) && (found_empty_slot == false) {
            found_empty_slot = true;
            array[index] = value_to_push;
        }
    }
    assert(found_empty_slot, "array has reached maximum capacity");
    array
}

// TODO: This can be replaced by BoundedVec too
pub fn array_push_array_field<T, N>(mut array : [Field; T], values_to_push : [Field;N]) -> [Field;T] {
    // see push_array_to_array in aztec3/utils/array.hpp
    array
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
//
// TODO(David): A bit of a nit, we use is_empty, but we are actually doing is_zero.
// TODO: Concretely, are we validating empty or zero regions?
// 
// TODO: We can possibly optimize this by taking advantage of the fact that adding 0 does not 
// TODO: change a running sum.
pub fn validate_array<T>(array : [Field;T]) {
    let array_length = array.len();

    let mut first_zero_pos = array_length;
    let mut last_non_zero_pos = 0;
    // TODO: using is_empty_field here is a bit wasteful
    for i in 0..array_length {
        if is_empty(array[i]) == false {
            last_non_zero_pos = i;
        } else if is_empty(array[i]) && (first_zero_pos == array_length) {
            first_zero_pos = i;
        }
    }
    assert((last_non_zero_pos as u64) <= (first_zero_pos as u64), "invalid array");
}

// Helper method to move all non-zero elements to the left of the array. E.g., [0,7,4,0,5] --> [7,4,5,0,0]
//  - The ordering of the non-zero values is preserved.
pub fn array_rearrange<N>(mut array : [Field; N]) -> [Field;N] {
    let mut target_pos : u64 = 0;
    for i in 0..N {
        if (array[i] != 0) {
            array[target_pos] = array[i];
            target_pos += 1;
        }
    }

    // Cleaning needed to avoid duplicate values, e.g., [1,0,3,0] --> [1,3,3,0] otherwise.
    for i in 0..N {
        if i >= target_pos {
            array[i] = 0;
        }
    }

    array
}

// TODO: like many of the methods, we need to fix the &mut Array
// bug then refactor most of the methods in here.
pub fn array_pop<N>(mut array : [Field; N]) -> (Field, [Field;N]) {
    let mut found_element_to_pop = false; 
    let mut index = N + 1; 
    for i in 0..N {
        // This is analogous to us doing (0..N).rev() 
        let rev_i = N - 1 - i;

        // If its non-empty, then we can take this item and 
        // replace its value with 0 to signify it being 
        let element_non_empty = array[rev_i] != 0;

        if element_non_empty && found_element_to_pop == false {
            found_element_to_pop = true;
            index = rev_i;
        }
    }

    assert(found_element_to_pop, "cannot pop from an empty array");
    let element = array[index];

    array[index] = 0;

    (element, array)
}

// Helper method to determine the number of non-zero/empty elements in
// the array.
pub fn array_length<N>(array : [Field; N]) -> Field {
    let mut length = 0;
    for elem in array {
        if elem != 0 {
            length += 1;
        }
    }
    length
}

#[test]
fn smoke_validate_array() {
    let valid_array = [];
    validate_array(valid_array);

    let valid_array = [0];
    validate_array(valid_array);

    let valid_array = [1,2,3];
    validate_array(valid_array);

    let valid_array = [1,2,3,0];
    validate_array(valid_array);

    let valid_array = [1,2,3,0,0];
    validate_array(valid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid(){
    let invalid_array = [0,1];
    validate_array(invalid_array);
}

#[test(should_fail_with = "invalid array")]
fn smoke_validate_array_invalid_case2(){
    let invalid_array = [0,0,0,0,1];
    validate_array(invalid_array);
}