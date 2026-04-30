// Demonstrates nested utility calls by implementing pow_utility(x, n) = x^n recursively,
// and calling it from a private function via pow_private.

use aztec::macros::aztec;

#[aztec]
pub contract NestedUtility {
    use aztec::macros::functions::external;

    #[external("utility")]
    unconstrained fn pow_utility(x: Field, n: u32) -> Field {
        if n == 0 {
            1
        } else {
            x * self.call(NestedUtility::at(self.address).pow_utility(x, n - 1))
        }
    }

    #[external("private")]
    fn pow_private(x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call(NestedUtility::at(self.address).pow_utility(x, n))
        }
    }
}
