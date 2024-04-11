// We use this because storage read is_empty does not match behavior with the normal way we calculate is_empty
trait StorageOp {
  fn is_empty(self) -> bool;
}

pub fn is_empty<T>(item: T) -> bool where T: StorageOp {
    item.is_empty()
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
pub fn validate_array<T, N>(array: [T; N]) where T: StorageOp + Eq {
    let array_length = array.len();

    let mut first_zero_pos = array_length;
    let mut last_non_zero_pos = 0;

    for i in 0..array_length {
        let is_empty = array[i].is_empty();
        if !is_empty {
            last_non_zero_pos = i;
        } else if is_empty & (first_zero_pos == array_length) {
            first_zero_pos = i;
        }
    }
    assert(last_non_zero_pos <= first_zero_pos, "invalid array");
}

// Helper method to determine the number of non-zero/empty elements in a validated array (ie, validate_array(array)
// should be true).
pub fn array_length<T, N>(array: [T; N]) -> u64 where T: StorageOp + Eq {
    let mut length = 0;
    let mut end = false;
    for elem in array {
        end |= elem.is_empty();
        if !end {
            length += 1;
        }
    }
    length
}

pub fn array_eq<T, N, S>(array: [T; N], expected: [T; S]) -> bool where T: StorageOp + Eq {
    let mut eq = array_length(array) == S;

    for i in 0..S {
        eq &= array[i].eq(expected[i]);
    }

    eq
}
