// We use this because storage read is_default does not match behavior with the normal way we calculate is_default
trait StorageRequest {
  fn is_default(self) -> bool;
}

pub fn is_default<T>(item: T) -> bool where T: StorageRequest {
    item.is_default()
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
pub fn validate_array<T, N>(array: [T; N]) where T: StorageRequest + Eq {
    let array_length = array.len();

    let mut first_zero_pos = array_length;
    let mut last_non_zero_pos = 0;

    for i in 0..array_length {
        let is_default = array[i].is_default();
        if !is_default {
            last_non_zero_pos = i;
        } else if is_default & (first_zero_pos == array_length) {
            first_zero_pos = i;
        }
    }
    assert(last_non_zero_pos <= first_zero_pos, "invalid array");
}

// Helper method to determine the number of non-zero/default elements in a validated array (ie, validate_array(array)
// should be true).
pub fn array_length<T, N>(array: [T; N]) -> u64 where T: StorageRequest + Eq {
    let mut length = 0;
    let mut end = false;
    for elem in array {
        end |= elem.is_default();
        if !end {
            length += 1;
        }
    }
    length
}
