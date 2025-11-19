use aztec::macros::aztec;

#[aztec]
pub contract PanicOnIncorrectlyPerformedPrivateCall {
    use aztec::{macros::functions::external, protocol_types::address::AztecAddress};

    #[external("private")]
    fn arbitrary_external_function() {
        PanicOnIncorrectlyPerformedPrivateCall::at(AztecAddress::ZERO).arbitrary_external_function();
    }
}
