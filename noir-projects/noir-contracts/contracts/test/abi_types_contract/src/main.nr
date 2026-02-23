// A contract used for testing that different types are supported as types on external function functions (both public
// and private).

mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AbiTypes {
    use aztec::{macros::functions::external, protocol::traits::{Deserialize, Serialize}};

    #[derive(Serialize, Deserialize, Eq)]
    pub struct CustomStruct {
        pub w: Field,
        pub x: bool,
        pub y: u64,
        pub z: i64,
    }

    #[external("public")]
    fn return_public_parameters(
        a: bool,
        b: Field,
        c: u64,
        d: i64,
        e: CustomStruct,
    ) -> (bool, Field, u64, i64, CustomStruct) {
        (a, b, c, d, e)
    }

    #[external("private")]
    fn return_private_parameters(
        a: bool,
        b: Field,
        c: u64,
        d: i64,
        e: CustomStruct,
    ) -> (bool, Field, u64, i64, CustomStruct) {
        (a, b, c, d, e)
    }
}
