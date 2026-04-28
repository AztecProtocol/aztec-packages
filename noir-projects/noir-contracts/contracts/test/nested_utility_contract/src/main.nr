// Demonstrates nested utility calls by implementing pow(x, n) = x^n recursively.

use aztec::macros::aztec;

#[aztec]
pub contract NestedUtility {
    use aztec::macros::functions::external;

    #[external("utility")]
    unconstrained fn pow(x: Field, n: u32) -> Field {
        if n == 0 {
            1
        } else {
            x * self.call(NestedUtility::at(self.address).pow(x, n - 1))
        }
    }
}
