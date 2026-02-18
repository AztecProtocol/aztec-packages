use aztec::macros::aztec;

#[aztec]
pub contract GenericProxy {
    use aztec::{
        macros::functions::external,
        protocol::{abis::function_selector::FunctionSelector, address::AztecAddress},
    };

    #[external("private")]
    fn forward_private_0(target: AztecAddress, selector: FunctionSelector) {
        let _ = self.context.call_private_function_no_args(target, selector);
    }

    #[external("private")]
    fn forward_private_1(target: AztecAddress, selector: FunctionSelector, args: [Field; 1]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_2(target: AztecAddress, selector: FunctionSelector, args: [Field; 2]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_3(target: AztecAddress, selector: FunctionSelector, args: [Field; 3]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_4(target: AztecAddress, selector: FunctionSelector, args: [Field; 4]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_4_and_return(
        target: AztecAddress,
        selector: FunctionSelector,
        args: [Field; 4],
    ) -> Field {
        let returns: Field =
            self.context.call_private_function(target, selector, args).get_preimage();
        returns
    }

    #[external("private")]
    fn forward_private_5(target: AztecAddress, selector: FunctionSelector, args: [Field; 5]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_6(target: AztecAddress, selector: FunctionSelector, args: [Field; 6]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_7(target: AztecAddress, selector: FunctionSelector, args: [Field; 7]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_8(target: AztecAddress, selector: FunctionSelector, args: [Field; 8]) {
        let _ = self.context.call_private_function(target, selector, args);
    }
}
