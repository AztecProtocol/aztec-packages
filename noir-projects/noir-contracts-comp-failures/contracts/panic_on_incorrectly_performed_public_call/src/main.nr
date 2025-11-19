use aztec::macros::aztec;

#[aztec]
pub contract PanicOnIncorrectlyPerformedPublicCall {
    use aztec::{macros::functions::external, protocol_types::address::AztecAddress};

    #[external("public")]
    fn arbitrary_public_function() {}

    #[external("public")]
    fn call_public_function_without_call() {
        PanicOnIncorrectlyPerformedPublicCall::at(AztecAddress::ZERO).arbitrary_public_function();
    }
}

