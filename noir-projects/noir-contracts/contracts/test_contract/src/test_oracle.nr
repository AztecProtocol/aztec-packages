#[oracle(testBoundedVecOracle)]
unconstrained fn test_bounded_vec_oracle<let N: u32>(
    test_vec: BoundedVec<Field, N>,
) -> [Field; N] {}

unconstrained fn test_bounded_vec<let N: u32>(
    test_vec: BoundedVec<Field, N>,
) -> [Field; N] {
    test_bounded_vec_oracle(test_vec)
}