/// Asserts that all fields in `input` after the first `in_len` fields are zero.
///
/// `in_len` must be a valid length, i.e. `in_len <= N` (`in_len == N` requires no trailing zeros).
/// Passing `in_len > N` is rejected: otherwise the loop below never reaches the breakpoint and the
/// trailing-zero check is silently skipped, letting a caller believe the array holds more meaningful
/// elements than it can.
pub fn assert_trailing_zeros<let N: u32>(input: [Field; N], in_len: u32) {
    assert(in_len <= N, "in_len is greater than the input array len");
    let mut should_check = false;
    for i in 0..N {
        should_check |= i == in_len;
        if should_check {
            assert_eq(input[i], 0, "Found non-zero field after breakpoint");
        }
    }
}

#[test]
fn test_assert_trailing_zeros_valid() {
    assert_trailing_zeros([1, 2, 0, 0], 2);
    assert_trailing_zeros([1, 2, 3, 4], 4); // in_len == N: no trailing zeros required.
    assert_trailing_zeros([0, 0, 0], 0);
}

#[test(should_fail_with = "Found non-zero field after breakpoint")]
fn test_assert_trailing_zeros_fails_on_nonzero_tail() {
    assert_trailing_zeros([1, 2, 3, 0], 2);
}

#[test(should_fail_with = "in_len is greater than the input array len")]
fn test_assert_trailing_zeros_fails_when_in_len_too_large() {
    assert_trailing_zeros([0, 0, 0], 4);
}

#[test]
fn test_assert_trailing_zeros_in_len_zero_requires_all_zero() {
    assert_trailing_zeros([0, 0, 0], 0);
    assert_trailing_zeros([0], 0);
}

#[test(should_fail_with = "Found non-zero field after breakpoint")]
fn test_assert_trailing_zeros_in_len_zero_nonzero_fails() {
    assert_trailing_zeros([5, 0, 0], 0);
}

#[test]
fn test_assert_trailing_zeros_single_and_boundary() {
    assert_trailing_zeros([5], 1); // in_len == N: nothing to check
    assert_trailing_zeros([1, 2, 3, 0], 3); // only index 3 is the tail, and it is zero
}

#[test(should_fail_with = "in_len is greater than the input array len")]
fn test_assert_trailing_zeros_in_len_one_over_bound() {
    assert_trailing_zeros([1, 2, 3, 4], 5);
}
