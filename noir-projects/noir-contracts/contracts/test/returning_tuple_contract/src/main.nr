use aztec::macros::aztec;

// Test that Aztec.nr handles returning tuples correctly.
#[aztec]
pub contract ReturningTuple {
    use aztec::macros::functions::{private, view};

    #[private]
    #[view]
    fn fn_that_returns_1() -> pub (Field) {
        (1)
    }

    #[private]
    #[view]
    fn fn_that_returns_2() -> pub (Field, Field) {
        (1, 2)
    }

    #[private]
    #[view]
    fn fn_that_returns_3() -> pub (Field, Field, Field) {
        (1, 2, 3)
    }

    #[private]
    #[view]
    fn fn_that_returns_4() -> pub (Field, Field, Field, Field) {
        (1, 2, 3, 4)
    }

    #[private]
    #[view]
    fn fn_that_returns_5() -> pub (Field, Field, Field, Field, Field) {
        (1, 2, 3, 4, 5)
    }

    #[private]
    #[view]
    fn fn_that_returns_6() -> pub (Field, Field, Field, Field, Field, Field) {
        (1, 2, 3, 4, 5, 6)
    }
}
