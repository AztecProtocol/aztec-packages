// A contract used for testing that different types are supported as types on external functions (both public, private
// and utility).

mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AbiTypes {
    use aztec::{
        macros::functions::external,
        protocol::{abis::function_selector::FunctionSelector, address::EthAddress, traits::{Deserialize, Serialize}},
    };

    #[derive(Serialize, Deserialize, Eq)]
    pub struct CustomStruct {
        pub w: Field,
        pub x: bool,
        pub y: u64,
        pub z: i64,
    }

    #[derive(Serialize, Deserialize, Eq)]
    pub struct WrappedField {
        pub inner: Field,
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

    #[external("utility")]
    unconstrained fn return_utility_parameters(
        a: bool,
        b: Field,
        c: u64,
        d: i64,
        e: CustomStruct,
    ) -> (bool, Field, u64, i64, CustomStruct) {
        (a, b, c, d, e)
    }

    #[external("utility")]
    unconstrained fn return_eth_address(addr: EthAddress) -> EthAddress {
        addr
    }

    #[external("utility")]
    unconstrained fn return_function_selector(selector: FunctionSelector) -> FunctionSelector {
        selector
    }

    #[external("utility")]
    unconstrained fn return_wrapped_field(wrapped: WrappedField) -> WrappedField {
        wrapped
    }
}
