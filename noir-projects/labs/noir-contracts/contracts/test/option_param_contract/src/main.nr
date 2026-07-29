mod test;

use aztec::macros::aztec;

#[aztec]
pub contract OptionParam {
    use aztec::{macros::functions::external, protocol::traits::{Deserialize, Serialize}};

    #[derive(Serialize, Deserialize, Eq)]
    pub struct SomeStruct {
        pub w: Field,
        pub x: bool,
        pub y: u64,
        pub z: i64,
    }

    #[external("public")]
    fn return_public_optional_struct(value: Option<SomeStruct>) -> Option<SomeStruct> {
        value
    }

    #[external("private")]
    fn return_private_optional_struct(value: Option<SomeStruct>) -> Option<SomeStruct> {
        value
    }

    #[external("utility")]
    unconstrained fn return_utility_optional_struct(value: Option<SomeStruct>) -> Option<SomeStruct> {
        value
    }
}
