use aztec::macros::aztec;

#[aztec]
pub contract PanicOnIncorrectlyPerformedPrivateStaticCall {
    use aztec::{
        macros::functions::{external, view},
        protocol_types::address::AztecAddress,
    };

    #[external("private")]
    #[view]
    fn arbitrary_view_function() -> Field {
        0
    }

    #[external("private")]
    fn call_static_function_without_view() {
        PanicOnIncorrectlyPerformedPrivateStaticCall::at(AztecAddress::ZERO)
            .arbitrary_view_function();
    }
}

