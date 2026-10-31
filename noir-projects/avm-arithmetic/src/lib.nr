/// Exact product represented as `hi * 2^128 + lo`.
pub struct U256 {
    pub lo: u128,
    pub hi: u128,
}

/// Computes an exact widening product. Available only in public AVM execution.
pub unconstrained fn wide_mul(a: u128, b: u128) -> U256 {
    let (lo, hi) = wide_mul_oracle(a, b);
    U256 { lo, hi }
}

#[oracle(aztec_avm_u128_wide_mul)]
unconstrained fn wide_mul_oracle(a: u128, b: u128) -> (u128, u128) {}

/// Returns floor(a * b / d) using the exact product. Public AVM execution only.
/// Fails when d is zero or the quotient exceeds U128.
pub unconstrained fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    mul_div_oracle(a, b, d)
}

#[oracle(aztec_avm_u128_mul_div)]
unconstrained fn mul_div_oracle(a: u128, b: u128, d: u128) -> u128 {}
