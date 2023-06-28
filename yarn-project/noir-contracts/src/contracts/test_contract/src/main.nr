contract Test {
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        Context::new().finish(inputs)
    }
}
