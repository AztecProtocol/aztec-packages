pub fn append<T, let A_LEN: u32, let B_LEN: u32, let DST_LEN: u32>(
    a: BoundedVec<T, A_LEN>,
    b: BoundedVec<T, B_LEN>,
) -> BoundedVec<T, DST_LEN> {
    let mut dst = BoundedVec::new();

    dst.extend_from_bounded_vec(a);
    dst.extend_from_bounded_vec(b);

    dst
}
