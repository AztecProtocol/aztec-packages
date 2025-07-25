// A contract used along with `Child` contract to test nested calls.
use dep::aztec::macros::aztec;

#[aztec]
pub contract Parent {
    use dep::aztec::{context::gas::GasOpts, macros::functions::{private, public}};
    use dep::aztec::protocol_types::constants::MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS;
    use aztec::protocol_types::{
        abis::function_selector::FunctionSelector, address::AztecAddress, traits::ToField,
    };
    // Private function to call another private function in the target_contract using the provided selector
    #[private]
    fn entry_point(target_contract: AztecAddress, target_selector: FunctionSelector) -> Field {
        // Call the target private function
        context.call_private_function(target_contract, target_selector, [0]).get_preimage()
    }
    // Public function to directly call another public function to the target_contract using the selector and value provided
    #[public]
    fn pub_entry_point(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        init_value: Field,
    ) -> Field {
        context.call_public_function(
            target_contract,
            target_selector,
            [init_value].as_slice(),
            GasOpts::default(),
        )[0]
    }
    // Same as pub_entry_point, but calls the target contract twice, using the return value from the first invocation as the argument for the second.
    #[public]
    fn pub_entry_point_twice(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        init_value: Field,
    ) -> Field {
        let return_value: Field = context.call_public_function(
            target_contract,
            target_selector,
            [init_value].as_slice(),
            GasOpts::default(),
        )[0];
        context.call_public_function(
            target_contract,
            target_selector,
            [return_value].as_slice(),
            GasOpts::default(),
        )[0]
    }
    // Private function to enqueue a call to the target_contract address using the selector and argument provided
    #[private]
    fn enqueue_call_to_child(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        target_value: Field,
    ) {
        context.call_public_function(target_contract, target_selector, [target_value]);
    }

    #[public]
    fn public_call_with_max_over_n_args(
        _args: [Field; MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 10],
    ) {}

    #[private]
    fn enqueue_call_to_child_with_many_args_and_recurse(remaining_recursions: u32) {
        let args = [0; MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 10];
        // +1 for function selector brings us to max
        Parent::at(context.this_address()).public_call_with_max_over_n_args(args).enqueue(
            &mut context,
        );
        if remaining_recursions > 0 {
            Parent::at(context.this_address())
                .enqueue_call_to_child_with_many_args_and_recurse(remaining_recursions - 1)
                .call(&mut context);
        }
    }

    // Private function that enqueues two calls to a child contract:
    // - one through a nested call to enqueue_call_to_child with value 10,
    // - followed by one issued directly from this function with value 20.
    #[private]
    fn enqueue_calls_to_child_with_nested_first(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
    ) {
        let enqueue_call_to_child_selector = comptime {
            FunctionSelector::from_signature("enqueue_call_to_child((Field),(u32),Field)")
        };
        let _ret = context.call_private_function(
            context.this_address(),
            enqueue_call_to_child_selector,
            [target_contract.to_field(), target_selector.to_field(), 10],
        );
        context.call_public_function(target_contract, target_selector, [20]);
    }
    // Private function that enqueues two calls to a child contract:
    // - one issued directly from this function with value 20,
    // - followed by one through a nested call to enqueue_call_to_child with value 10.
    #[private]
    fn enqueue_calls_to_child_with_nested_last(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
    ) {
        context.call_public_function(target_contract, target_selector, [20]);
        let enqueue_call_to_child_selector = comptime {
            FunctionSelector::from_signature("enqueue_call_to_child((Field),(u32),Field)")
        };
        let _ret = context.call_private_function(
            context.this_address(),
            enqueue_call_to_child_selector,
            [target_contract.to_field(), target_selector.to_field(), 10],
        );
    }
    // Private function to enqueue a call to the target_contract address using the selector and argument provided
    #[private]
    fn enqueue_call_to_child_twice(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        target_value: Field,
    ) {
        // Enqueue the first public call
        context.call_public_function(target_contract, target_selector, [target_value]);
        // Enqueue the second public call
        context.call_public_function(target_contract, target_selector, [target_value + 1]);
    }
    // Private function to enqueue a call to the pub_entry_point function of this same contract, passing the target arguments provided
    #[private]
    fn enqueue_call_to_pub_entry_point(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        target_value: Field,
    ) {
        let pub_entry_point_selector =
            comptime { FunctionSelector::from_signature("pub_entry_point((Field),(u32),Field)") };
        let this_address = context.this_address();
        let _void = context.call_public_function(
            this_address,
            pub_entry_point_selector,
            [target_contract.to_field(), target_selector.to_field(), target_value],
        );
    }
    // Private function to enqueue two calls to the pub_entry_point function of this same contract, passing the target arguments provided
    #[private]
    fn enqueue_calls_to_pub_entry_point(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        target_value: Field,
    ) {
        let pub_entry_point_selector =
            comptime { FunctionSelector::from_signature("pub_entry_point((Field),(u32),Field)") };
        let this_address = context.this_address();
        context.call_public_function(
            this_address,
            pub_entry_point_selector,
            [target_contract.to_field(), target_selector.to_field(), target_value],
        );
        context.call_public_function(
            this_address,
            pub_entry_point_selector,
            [target_contract.to_field(), target_selector.to_field(), target_value + 1],
        );
    }
    #[private]
    fn private_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        // Call the target private function
        context.static_call_private_function(target_contract, target_selector, args).get_preimage()
    }
    #[private]
    fn private_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        // Call the target private function
        context.call_private_function(target_contract, target_selector, args).get_preimage()
    }
    // Private function to set a static context and verify correct propagation for nested private calls
    #[private]
    fn private_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 2],
    ) -> Field {
        // Call the target private function statically
        let private_call_selector =
            FunctionSelector::from_signature("private_call((Field),(u32),[Field;2])");
        let this_address = context.this_address();
        let return_value: Field = context
            .static_call_private_function(
                this_address,
                private_call_selector,
                [target_contract.to_field(), target_selector.to_field(), args[0], args[1]],
            )
            .get_preimage();
        // Copy the return value from the call to this function's return values
        return_value
    }
    // Public function to directly call another public function to the target_contract using the selector and value provided
    #[public]
    fn public_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) -> Field {
        context.static_call_public_function(
            target_contract,
            target_selector,
            args.as_slice(),
            GasOpts::default(),
        )[0]
    }
    // Public function to set a static context and verify correct propagation for nested public calls
    #[public]
    fn public_nested_static_call(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) -> Field {
        // Call the target public function through the pub entrypoint statically
        let pub_entry_point_selector =
            FunctionSelector::from_signature("pub_entry_point((Field),(u32),Field)");
        let this_address = context.this_address();
        context.static_call_public_function(
            this_address,
            pub_entry_point_selector,
            [target_contract.to_field(), target_selector.to_field(), args[0]].as_slice(),
            GasOpts::default(),
        )[0]
    }
    // Private function to enqueue a static call to the pub_entry_point function of another contract, passing the target arguments provided
    #[private]
    fn enqueue_static_nested_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) {
        // Call the target public function through the pub entrypoint statically
        let pub_entry_point_selector =
            FunctionSelector::from_signature("pub_entry_point((Field),(u32),Field)");
        let this_address = context.this_address();
        context.static_call_public_function(
            this_address,
            pub_entry_point_selector,
            [target_contract.to_field(), target_selector.to_field(), args[0]],
        );
    }
    // Private function to enqueue a static call to the pub_entry_point function of another contract, passing the target arguments provided
    #[private]
    fn enqueue_static_call_to_pub_function(
        target_contract: AztecAddress,
        target_selector: FunctionSelector,
        args: [Field; 1],
    ) {
        // Call the target private function
        context.static_call_public_function(target_contract, target_selector, args);
    }
    use dep::aztec::test::helpers::test_environment::TestEnvironment;
    use dep::child_contract::Child;

    #[test]
    unconstrained fn test_private_call() {
        let env = TestEnvironment::new();
        let owner = env.create_account(1);

        // Deploy parent contract
        let parent_contract = env.deploy_self("Parent").without_initializer();
        let parent_contract_address = parent_contract.to_address();

        // Deploy child contract
        let child_contract = env.deploy("./@child_contract", "Child").without_initializer();
        let child_contract_address = child_contract.to_address();

        // The 'from' param is irrelevant in all tests below.
        let from = owner;

        // Set value in child through parent
        let value_to_set = 7;
        let result = env
            .call_private(
                from,
                Parent::at(parent_contract_address).private_call(
                    child_contract_address,
                    comptime {
                        FunctionSelector::from_signature("private_set_value(Field,(Field))")
                    },
                    [value_to_set, owner.to_field()],
                ),
            )
            .return_value;
        assert(result == value_to_set);

        // Read the stored value in the note.
        let note_value = env
            .call_private(
                from,
                Child::at(child_contract_address).private_get_value(value_to_set, owner),
            )
            .return_value;
        assert(note_value == value_to_set);

        // Get value from child through parent
        let read_result = env
            .call_private(
                from,
                Parent::at(parent_contract_address).private_call(
                    child_contract_address,
                    comptime {
                        FunctionSelector::from_signature("private_get_value(Field,(Field))")
                    },
                    [7, owner.to_field()],
                ),
            )
            .return_value;
        assert(note_value == read_result);
    }
}
