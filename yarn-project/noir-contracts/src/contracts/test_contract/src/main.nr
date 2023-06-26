contract Test {
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub dep::aztec3::abi::PrivateCircuitPublicInputs {
        PrivateFunctionContext::new().finish(inputs)
    }
}
