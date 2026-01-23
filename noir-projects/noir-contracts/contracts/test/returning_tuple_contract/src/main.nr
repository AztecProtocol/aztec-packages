use aztec::macros::aztec;

// Tests that Aztec.nr handles returning tuples correctly.
#[aztec]
pub contract ReturningTuple {
    use aztec::{
        macros::functions::{external, view},
        protocol_types::{address::AztecAddress, point::Point, traits::{Deserialize, FromField}},
    };

    #[external("private")]
    #[view]
    fn fn_that_returns_1() -> (bool,) {
        (true,)
    }

    #[external("private")]
    #[view]
    fn fn_that_returns_2() -> (Field, u32) {
        (1, 2)
    }

    #[external("private")]
    #[view]
    fn fn_that_returns_3() -> (Field, bool, str<4>) {
        (1, true, "test")
    }

    #[external("private")]
    #[view]
    fn fn_that_returns_4() -> (Field, u64, bool, str<3>) {
        (1, 2, false, "abc")
    }

    #[external("private")]
    #[view]
    fn fn_that_returns_5() -> (Field, u32, bool, str<2>, i64) {
        (1, 2, true, "hi", -5)
    }

    #[external("private")]
    #[view]
    fn fn_that_returns_6() -> (Field, u128, bool, str<3>, AztecAddress, Point) {
        (1, 2, false, "xyz", AztecAddress::from_field(1), Point::deserialize([1, 2, 3]))
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_1_public() -> (bool,) {
        (true,)
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_2_public() -> (Field, u32) {
        (1, 2)
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_3_public() -> (Field, bool, str<4>) {
        (1, true, "test")
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_4_public() -> (Field, u64, bool, str<3>) {
        (1, 2, false, "abc")
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_5_public() -> (Field, u32, bool, str<2>, i64) {
        (1, 2, true, "hi", -5)
    }

    #[external("public")]
    #[view]
    fn fn_that_returns_6_public() -> (Field, u128, bool, str<3>, AztecAddress, Point) {
        (1, 2, false, "xyz", AztecAddress::from_field(1), Point::deserialize([1, 2, 3]))
    }

}
