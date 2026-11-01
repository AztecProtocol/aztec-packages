use std::cmp::{Eq, Ord, Ordering};

/// Exact product represented as `hi * 2^128 + lo`.
pub struct U256 {
    pub lo: u128,
    pub hi: u128,
}

impl Eq for U256 {
    fn eq(self, other: Self) -> bool {
        (self.hi == other.hi) & (self.lo == other.lo)
    }
}

/// Orders by `hi` then `lo`, which is numeric order because both limbs are 128-bit.
impl Ord for U256 {
    fn cmp(self, other: Self) -> Ordering {
        if self.hi != other.hi {
            self.hi.cmp(other.hi)
        } else {
            self.lo.cmp(other.lo)
        }
    }
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

mod tests {
    use super::U256;

    global MAX: u128 = 0xffffffffffffffffffffffffffffffff;

    #[test]
    fn orders_by_hi_before_lo() {
        let a = U256 { lo: MAX, hi: 0 };
        let b = U256 { lo: 0, hi: 1 };
        assert(a < b);
        assert(a <= b);
        assert(b > a);
        assert(b >= a);
        assert(!(b < a));
        assert(!(a >= b));
    }

    #[test]
    fn equal_values_compare_equal() {
        let a = U256 { lo: 5, hi: 7 };
        let b = U256 { lo: 5, hi: 7 };
        assert(a == b);
        assert(a >= b);
        assert(a <= b);
        assert(!(a < b));
        assert(!(a > b));
        assert(!(a != b));
    }

    #[test]
    fn equal_hi_compares_lo() {
        let a = U256 { lo: 4, hi: 9 };
        let b = U256 { lo: 5, hi: 9 };
        assert(a < b);
        assert(b > a);
        assert(a != b);
    }

    #[test]
    fn extremes() {
        let zero = U256 { lo: 0, hi: 0 };
        let max = U256 { lo: MAX, hi: MAX };
        assert(zero < max);
        assert(max >= max);
        assert(max > U256 { lo: MAX - 1, hi: MAX });
        assert(max > U256 { lo: MAX, hi: MAX - 1 });
    }
}
