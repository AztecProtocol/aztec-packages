use aztec::macros::aztec;

#[aztec]
pub contract PanicOnIncorrectlyPerformedPublicCall {
    use aztec::{macros::functions::external, protocol::address::AztecAddress};

    #[external("public")]
    fn arbitrary_public_function() {}

    #[external("public")]
    fn call_public_function_without_call() {
        PanicOnIncorrectlyPerformedPublicCall::at(AztecAddress::zero()).arbitrary_public_function();
    }
}

