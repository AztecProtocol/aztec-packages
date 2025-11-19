use aztec::macros::aztec;

#[aztec]
pub contract PanicOnIncorrectlyPerformedPublicStaticCall {
    use aztec::{
        macros::functions::{external, view},
        protocol_types::address::AztecAddress,
    };

    #[external("public")]
    #[view]
    fn arbitrary_public_static_function() -> Field {
        0
    }

    #[external("public")]
    fn call_public_static_function_without_view() {
        PanicOnIncorrectlyPerformedPublicStaticCall::at(AztecAddress::ZERO)
            .arbitrary_public_static_function();
    }
}

