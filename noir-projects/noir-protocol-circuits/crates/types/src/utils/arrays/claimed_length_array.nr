use crate::traits::{Deserialize, Empty, Serialize};
use crate::utils::for_loop::for_i_in_0_;

/// ClaimedLengthArray - An array interpreted by Kernel circuits.
/// Its `length` is merely a claim that must eventually be validated.
/// Validation must include:
/// - Asserting all items to the LHS of the length are nonempty (dense).
/// - Asserting all items to the RHS of the length are empty.
#[derive(Eq, Deserialize, Serialize)]
pub struct ClaimedLengthArray<T, let N: u32> {
    pub array: [T; N],
    pub length: u32,
}

impl<T, let N: u32> ClaimedLengthArray<T, N>
where
    T: Empty,
{
    // No constructor. Append to an empty one.

    // For constrained append functions, see the dedicated file: assert_array_appended.nr

    pub fn assert_dense_trimmed(self) {
        for_i_in_0_(
            self.length,
            N,
            |i| {
                assert(!self.array[i].is_empty(), "LHS of input array is not dense")
                // Requires Noir #9002:
                // self.array[i].assert_not_empty("LHS of input array is not dense"); // LHS of input array is not dense.
            },
            |i| self.array[i].assert_empty("RHS of input array is not empty"),
            false,
        );
    }

    pub fn assert_empty<let S: u32>(self, msg: str<S>) {
        for i in 0..N {
            self.array[i].assert_empty(msg);
        }
        assert_eq(self.length, 0);
    }

    pub fn assert_length_within_bounds<let S: u32>(self, msg: str<S>) {
        assert(self.length <= N, msg);
    }

    pub fn push(&mut self, item: T) {
        assert(self.length != N, "Array full");

        let next_index = self.length;
        self.array[next_index] = item;
        self.length += 1;
    }

    pub fn pop(&mut self) -> T {
        assert(self.length != 0, "Array empty");

        let mut top_index = self.length - 1;
        let popped_item = self.array[top_index];
        self.array[top_index] = T::empty();
        self.length -= 1;
        popped_item
    }

    pub fn for_each<Env>(self, f: fn[Env](T) -> ()) {
        let mut within_range = true;
        for i in 0..N {
            within_range &= i != self.length;
            if within_range {
                f(self.array[i]);
            }
        }
        // for_i_only_in_0_(self.length, N, |i| { f(self.array[i]) }, false);
    }

    // E.g.
    // dest.for_each_i(|source_item, i| { assert_eq(dest.array[i], source_item, "bad copy"); })
    pub fn for_each_i<Env>(self, f: fn[Env](T, u32) -> ()) {
        let mut within_range = true;
        for i in 0..N {
            within_range &= i != self.length;
            if within_range {
                f(self.array[i], i);
            }
        }
        // for_i_only_in_0_(self.length, N, |i| { f(self.array[i], i) }, false);
    }

    pub fn from_bounded_vec(vec: BoundedVec<T, N>) -> Self {
        Self { array: vec.storage(), length: vec.len() }
    }
}

impl<T, let N: u32> Empty for ClaimedLengthArray<T, N>
where
    T: Empty,
{
    fn empty() -> Self {
        Self { array: [T::empty(); N], length: 0 }
    }
}

// ==================== empty tests ====================

#[test]
fn test_empty() {
    let arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    assert_eq(arr.array, [0, 0, 0]);
    assert_eq(arr.length, 0);
}

// ==================== push tests ====================

#[test]
fn test_push() {
    let mut arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    arr.push(10);
    assert_eq(arr.array, [10, 0, 0]);
    assert_eq(arr.length, 1);

    arr.push(20);
    assert_eq(arr.array, [10, 20, 0]);
    assert_eq(arr.length, 2);

    arr.push(30);
    assert_eq(arr.array, [10, 20, 30]);
    assert_eq(arr.length, 3);
}

#[test(should_fail_with = "Array full")]
fn test_push_fails_when_full() {
    let mut arr: ClaimedLengthArray<Field, 2> = ClaimedLengthArray::empty();
    arr.push(10);
    arr.push(20);
    arr.push(30);
}

// ==================== pop tests ====================

#[test]
fn test_pop() {
    let mut arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    arr.push(10);
    arr.push(20);
    arr.push(30);

    assert_eq(arr.pop(), 30);
    assert_eq(arr.length, 2);
    assert_eq(arr.array, [10, 20, 0]);

    assert_eq(arr.pop(), 20);
    assert_eq(arr.length, 1);

    assert_eq(arr.pop(), 10);
    assert_eq(arr.length, 0);
}

#[test(should_fail_with = "Array empty")]
fn test_pop_fails_when_empty() {
    let mut arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    let _ = arr.pop();
}

// ==================== assert_dense_trimmed tests ====================

#[test]
fn test_assert_dense_trimmed_valid() {
    // Valid: dense LHS, empty RHS
    let arr = ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
    arr.assert_dense_trimmed();

    // Valid: all empty with length 0
    let arr2 = ClaimedLengthArray { array: [0, 0, 0, 0], length: 0 };
    arr2.assert_dense_trimmed();

    // Valid: all full
    let arr3 = ClaimedLengthArray { array: [10, 20, 30, 40], length: 4 };
    arr3.assert_dense_trimmed();
}

#[test(should_fail_with = "LHS of input array is not dense")]
fn test_assert_dense_trimmed_fails_with_gap_in_lhs() {
    // Invalid: gap in LHS (empty where non-empty expected)
    let arr = ClaimedLengthArray { array: [10, 0, 30, 0], length: 3 };
    arr.assert_dense_trimmed();
}

#[test(should_fail_with = "RHS of input array is not empty")]
fn test_assert_dense_trimmed_fails_with_nonempty_in_rhs() {
    // Invalid: non-empty in RHS (should be empty)
    let arr = ClaimedLengthArray { array: [10, 20, 30, 40], length: 2 };
    arr.assert_dense_trimmed();
}

#[test(should_fail_with = "LHS of input array is not dense")]
fn test_assert_dense_trimmed_fails_with_empty_lhs() {
    // Invalid: claimed length 2 but first element is empty
    let arr = ClaimedLengthArray { array: [0, 20, 0, 0], length: 2 };
    arr.assert_dense_trimmed();
}

// ==================== assert_empty tests ====================

#[test]
fn test_assert_empty_valid() {
    let arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    arr.assert_empty("should be empty");
}

#[test(should_fail)]
fn test_assert_empty_fails_with_nonzero_length() {
    let arr = ClaimedLengthArray { array: [0, 0, 0], length: 1 };
    arr.assert_empty("should be empty");
}

#[test(should_fail)]
fn test_assert_empty_fails_with_nonempty_element() {
    let arr = ClaimedLengthArray { array: [10, 0, 0], length: 0 };
    arr.assert_empty("should be empty");
}

// ==================== assert_length_within_bounds tests ====================

#[test]
fn test_assert_length_within_bounds_valid() {
    let arr = ClaimedLengthArray { array: [10, 20, 0], length: 2 };
    arr.assert_length_within_bounds("length out of bounds");

    let arr2 = ClaimedLengthArray { array: [10, 20, 30], length: 3 };
    arr2.assert_length_within_bounds("length out of bounds");

    let arr3: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    arr3.assert_length_within_bounds("length out of bounds");
}

#[test(should_fail)]
fn test_assert_length_within_bounds_fails() {
    let arr = ClaimedLengthArray { array: [10, 20, 30], length: 5 };
    arr.assert_length_within_bounds("length out of bounds");
}

// ==================== for_each tests ====================

#[test]
fn test_for_each() {
    let arr = ClaimedLengthArray { array: [10, 20, 30, 0, 0], length: 3 };
    let sum = &mut 0;
    arr.for_each(|item| { *sum += item; });
    assert_eq(*sum, 60);
}

#[test]
fn test_for_each_empty() {
    let arr: ClaimedLengthArray<Field, 3> = ClaimedLengthArray::empty();
    let sum = &mut 0;
    arr.for_each(|item| { *sum += item; });
    assert_eq(*sum, 0);
}

// ==================== for_each_i tests ====================

#[test]
fn test_for_each_i() {
    let arr = ClaimedLengthArray { array: [10, 20, 30, 0, 0], length: 3 };
    let sum = &mut 0;
    let index_sum = &mut 0;
    arr.for_each_i(|item, i| {
        *sum += item;
        *index_sum += i;
    });
    assert_eq(*sum, 60);
    assert_eq(*index_sum, 3); // 0 + 1 + 2
}

// ==================== from_bounded_vec tests ====================

#[test]
fn test_from_bounded_vec() {
    let mut vec: BoundedVec<Field, 5> = BoundedVec::new();
    vec.push(10);
    vec.push(20);
    vec.push(30);

    let arr = ClaimedLengthArray::from_bounded_vec(vec);
    assert_eq(arr.length, 3);
    assert_eq(arr.array[0], 10);
    assert_eq(arr.array[1], 20);
    assert_eq(arr.array[2], 30);
}
