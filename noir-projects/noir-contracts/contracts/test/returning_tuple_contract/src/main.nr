use aztec::macros::aztec;

// Tests that Aztec.nr handles returning tuples correctly.
#[aztec]
pub contract ReturningTuple {
    use aztec::{
        macros::functions::{private, view},
        prelude::{AztecAddress, Point},
        protocol_types::traits::{Deserialize, FromField},
    };

    #[private]
    #[view]
    fn fn_that_returns_1() -> pub (bool,) {
        (true,)
    }

    #[private]
    #[view]
    fn fn_that_returns_2() -> pub (Field, u32) {
        (1, 2)
    }

    #[private]
    #[view]
    fn fn_that_returns_3() -> pub (Field, bool, str<4>) {
        (1, true, "test")
    }

    #[private]
    #[view]
    fn fn_that_returns_4() -> pub (Field, u64, bool, str<3>) {
        (1, 2, false, "abc")
    }

    #[private]
    #[view]
    fn fn_that_returns_5() -> pub (Field, u32, bool, str<2>, i64) {
        (1, 2, true, "hi", -5)
    }

    #[private]
    #[view]
    fn fn_that_returns_6() -> pub (Field, u128, bool, str<3>, AztecAddress, Point) {
        (1, 2, false, "xyz", AztecAddress::from_field(1), Point::deserialize([1, 2, 3]))
    }
}
