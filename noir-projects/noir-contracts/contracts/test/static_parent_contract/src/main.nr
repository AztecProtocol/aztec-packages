// A contract used along with `StaticChild` contract to test static calls.
use dep::aztec::macros::aztec;

#[aztec]
pub contract StaticParent {
    use dep::aztec::{context::gas::GasOpts, macros::functions::{external, view}};
    use dep::aztec::protocol_types::{
        abis::function_selector::FunctionSelector, address::AztecAddress,
    };
    use dep::static_child_contract::StaticChild;

    // Public function to directly call another public function to the target_contract using the selector and value provided
    #[external("public")]
    #[view]
    fn public_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        arg: Field,
    ) -> Field {
        self.context.call_public_function(
            target_contract,
            target_selector,
            [arg].as_slice(),
            GasOpts::default(),
        )[0]
    }

    // Private function to directly call another private function to the target_contract using the selector and args provided
    #[external("private")]
    fn private_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        self.context.call_private_function(target_contract, target_selector, args).get_preimage()
    }

    // Just like function above but with 3 args.
    #[external("private")]
    #[view]
    fn private_call_3_args(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 3],
    ) -> Field {
        self.context.call_private_function(target_contract, target_selector, args).get_preimage()
    }

    // Private function to enqueue a call to a public function of another contract, passing the target arguments provided
    #[external("private")]
    fn enqueue_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) {
        self.context.call_public_function(target_contract, target_selector, args, false);
    }

    #[external("private")]
    fn private_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        self
            .context
            .static_call_private_function(target_contract, target_selector, args)
            .get_preimage()
    }

    // Private function to statically call another private function to the target_contract using the selector and values provided
    #[external("private")]
    fn private_static_call_3_args(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 3],
    ) -> Field {
        self
            .context
            .static_call_private_function(target_contract, target_selector, args)
            .get_preimage()
    }

    // Same as above but using a specific function from the interface
    #[external("private")]
    fn private_get_value_from_child(
        target_contract: AztecAddress,
        value: Field,
        owner: AztecAddress,
    ) -> Field {
        self.view(StaticChild::at(target_contract).private_get_value(value, owner))
    }

    // Private function to set a static context and verify correct propagation for nested private calls
    #[external("private")]
    fn private_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        // Not using the new self.view(...) API because that doesn't allow for static calls to non-static functions
        // which this test seems to rely on. TODO(F-130): Address this and replace e2e_static_calls.test.ts with Noir
        // tests.
        StaticParent::at(self.address).private_call(target_contract, target_selector, args).view(
            self.context,
        )
    }

    // Just like function above but with 3 args.
    #[external("private")]
    fn private_nested_static_call_3_args(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 3],
    ) -> Field {
        self.view(StaticParent::at(self.address).private_call_3_args(
            target_contract,
            target_selector,
            args,
        ))
    }

    // Public function to statically call another public function to the target_contract using the selector and value provided
    #[external("public")]
    fn public_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) -> Field {
        self.context.static_call_public_function(
            target_contract,
            target_selector,
            args.as_slice(),
            GasOpts::default(),
        )[0]
    }

    // Same as above but using a specific function from the interface
    #[external("public")]
    fn public_get_value_from_child(target_contract: AztecAddress, value: Field) -> Field {
        self.view(StaticChild::at(target_contract).pub_get_value(value))
    }

    // Public function to set a static context and verify correct propagation for nested public calls
    #[external("public")]
    fn public_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) -> Field {
        // Call the target public function through the pub entrypoint statically
        StaticParent::at(self.address).public_call(target_contract, target_selector, args[0]).view(
            self.context,
        )
    }

    // Private function to enqueue a static call to a public function of another contract, passing the target arguments provided
    #[external("private")]
    fn enqueue_static_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) {
        self.context.static_call_public_function(target_contract, target_selector, args, false);
    }

    // Same as above but using a specific function from the interface
    #[external("private")]
    fn enqueue_public_get_value_from_child(target_contract: AztecAddress, value: Field) {
        self.enqueue_view(StaticChild::at(target_contract).pub_get_value(value));
    }

    // Private function to set a static context and verify correct propagation of nested enqueuing of public calls
    #[external("private")]
    fn enqueue_static_nested_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) {
        // Call the target public function through the pub entrypoint statically
        self.enqueue_view(StaticParent::at(self.address).public_call(
            target_contract,
            target_selector,
            args[0],
        ))
    }
}
