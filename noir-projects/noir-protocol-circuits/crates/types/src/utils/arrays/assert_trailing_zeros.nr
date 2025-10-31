/// Asserts that all fields in `input` after the first `in_len` fields are zero.
pub fn assert_trailing_zeros<let N: u32>(input: [Field; N], in_len: u32) {
    let mut should_check = false;
    for i in 0..N {
        should_check |= i == in_len;
        if should_check {
            assert_eq(input[i], 0, "Found non-zero field after breakpoint");
        }
    }
}
