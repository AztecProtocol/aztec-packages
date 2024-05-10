
// A contract used along with `Child` contract to test nested calls.
contract StaticParent {
    use dep::aztec::prelude::{AztecAddress, FunctionSelector, Deserialize};
    use dep::aztec::context::gas::GasOpts;

    // Public function to directly call another public function to the target_contract using the selector and value provided
    #[aztec(public)]
    fn public_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        arg: Field
    ) -> Field {
        context.call_public_function(
            target_contract,
            target_selector,
            [arg].as_slice(),
            GasOpts::default()
        ).deserialize_into()
    }

    #[aztec(private)]
    fn private_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2]
    ) -> Field {
        // Call the target private function
        context.call_private_function(target_contract, target_selector, args).unpack_into()
    }

    #[aztec(private)]
    fn private_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2]
    ) -> Field {
        // Call the target private function
        context.static_call_private_function(target_contract, target_selector, args).unpack_into()
    }

    // Private function to set a static context and verify correct propagation for nested private calls
    #[aztec(private)]
    fn private_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2]
    ) -> Field {
        // Call the target private function statically
        let private_call_selector = FunctionSelector::from_signature("private_call((Field),(u32),[Field;2])");
        let this_address = context.this_address();
        let return_value: Field = context.static_call_private_function(
            this_address,
            private_call_selector,
            [target_contract.to_field(), target_selector.to_field(), args[0], args[1]]
        ).unpack_into();

        // Copy the return value from the call to this function's return values
        return_value
    }

    // Public function to directly call another public function to the target_contract using the selector and value provided
    #[aztec(public)]
    fn public_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) -> Field {
        context.static_call_public_function(
            target_contract,
            target_selector,
            args.as_slice(),
            GasOpts::default()
        ).deserialize_into()
    }

    // Public function to set a static context and verify correct propagation for nested public calls
    #[aztec(public)]
    fn public_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) -> Field {
        // Call the target public function through the pub entrypoint statically
        StaticParent::at(context.this_address()).public_call(target_contract, target_selector, args[0]).static_call(&mut context)
    }

    // Private function to enqueue a static call to the pub_entry_point function of another contract, passing the target arguments provided
    #[aztec(private)]
    fn enqueue_static_nested_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) {
        // Call the target public function through the pub entrypoint statically
        StaticParent::at(context.this_address()).public_call(target_contract, target_selector, args[0]).static_enqueue(&mut context)
    }

    // Private function to enqueue a static call to the pub_entry_point function of another contract, passing the target arguments provided
    #[aztec(private)]
    fn enqueue_static_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1]
    ) {
        // Call the target private function
        context.static_call_public_function(target_contract, target_selector, args);
    }
}
