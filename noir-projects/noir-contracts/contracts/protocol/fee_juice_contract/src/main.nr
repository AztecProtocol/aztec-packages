mod lib;

pub contract FeeJuice {
    use crate::lib::get_bridge_gas_msg_hash;
    use aztec::{
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            constants::FEE_JUICE_ADDRESS,
            traits::ToField,
        },
        state_vars::{Map, PublicMutable},
    };
    use std::ops::Add;

    struct Storage<Context> {
        // This map is accessed directly by protocol circuits to check balances for fee payment.
        // Do not change this storage layout unless you also update the base rollup circuits.
        balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    }

    global INCREASE_PUBLIC_BALANCE_SELECTOR: Field = comptime {
        FunctionSelector::from_signature("_increase_public_balance((Field),u128)").to_field()
    };
    global CHECK_BALANCE_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("check_balance(u128)").to_field() };
    global BALANCE_OF_PUBLIC_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("balance_of_public((Field))").to_field() };

    /// Verifies that a message from L1 exists with the correct claim information, consumes it (emitting a nullifier)
    /// and enqueues the increase in public balance of the recipient.
    #[contract_library_method]
    fn claim_helper(
        context: &mut aztec::context::PrivateContext,
        to: AztecAddress,
        amount: u128,
        secret: Field,
        message_leaf_index: Field,
    ) {
        let content_hash: Field = get_bridge_gas_msg_hash(to, amount);
        let portal_address: EthAddress = EthAddress::from_field(FEE_JUICE_ADDRESS.to_field());
        assert(!portal_address.is_zero());

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content_hash, secret, portal_address, message_leaf_index);

        // Enqueue call to _increase_public_balance
        // Note: The rest of the function body used to be `self.enqueue_self._increase_public_balance(to, amount);`
        // before de-macroification.
        let serialized_params: [Field; 2] = [to.to_field(), amount.to_field()];
        let calldata: [Field; 1 + 2] = [INCREASE_PUBLIC_BALANCE_SELECTOR].concat(serialized_params);
        let calldata_hash: Field = aztec::hash::hash_calldata_array(calldata);
        aztec::oracle::execution_cache::store(calldata, calldata_hash);
        context.call_public_function_with_calldata_hash(
            context.this_address(),
            calldata_hash,
            false,
            false,
        );
    }

    /// Claims FeeJuice by consuming an L1 to L2 message with the provided information.
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn claim(
        inputs: aztec::context::inputs::PrivateContextInputs,
        to: AztecAddress,
        amount: u128,
        secret: Field,
        message_leaf_index: Field,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function.
        // nor in the claim helper function or the enqueued public function call, I have removed that check.
        aztec::oracle::version::assert_compatible_oracle_version();
        let serialized_params: [Field; 4] =
            [to.to_field(), amount.to_field(), secret, message_leaf_index];
        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext =
            aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        claim_helper(&mut context, to, amount, secret, message_leaf_index);

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    /// Claims FeeJuice by consuming an L1 to L2 message with the provided information. After enqueuing the
    /// the balance increase it ends the setup phase, making sure the claim happens in the non-revertible phase
    /// of the transaction. This variant should only be used when the intent is to pay the transaction fee via
    /// the claimed fee juice in a single interaction.
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn claim_and_end_setup(
        inputs: aztec::context::inputs::PrivateContextInputs,
        to: AztecAddress,
        amount: u128,
        secret: Field,
        message_leaf_index: Field,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        aztec::oracle::version::assert_compatible_oracle_version();
        let serialized_params: [Field; 4] =
            [to.to_field(), amount.to_field(), secret, message_leaf_index];
        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext =
            aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        claim_helper(&mut context, to, amount, secret, message_leaf_index);

        // MACRO CODE START
        context.end_setup();
        context.finish()
        // MACRO CODE END
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_only_self]
    unconstrained fn _increase_public_balance(to: AztecAddress, amount: u128) {
        // MACRO CODE START
        let context: aztec::context::PublicContext = aztec::context::PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 2] = aztec::oracle::avm::calldata_copy(
                    1,
                    <AztecAddress as aztec::protocol::traits::Serialize>::N
                        + <u128 as aztec::protocol::traits::Serialize>::N,
                );
                aztec::hash::hash_args(serialized_args)
            },
        );
        let storage: Storage<aztec::context::PublicContext> =
            Storage::<aztec::context::PublicContext>::init(context);

        assert(
            context.maybe_msg_sender().unwrap() == context.this_address(),
            "Function _increase_public_balance can only be called by the same contract",
        );
        // MACRO CODE END

        let new_balance = storage.balances.at(to).read().add(amount);
        storage.balances.at(to).write(new_balance);
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_view]
    unconstrained fn check_balance(fee_limit: u128) {
        // MACRO CODE START
        let context: aztec::context::PublicContext = aztec::context::PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] = aztec::oracle::avm::calldata_copy(
                    1,
                    <u128 as aztec::protocol::traits::Serialize>::N,
                );
                aztec::hash::hash_args(serialized_args)
            },
        );
        let storage: Storage<aztec::context::PublicContext> =
            Storage::<aztec::context::PublicContext>::init(context);

        assert(context.is_static_call(), "Function check_balance can only be called statically");
        // MACRO CODE END

        assert(
            storage.balances.at(context.maybe_msg_sender().unwrap()).read() >= fee_limit,
            "Balance too low",
        );
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_view]
    unconstrained fn balance_of_public(owner: AztecAddress) -> pub u128 {
        // MACRO CODE START
        let context: aztec::context::PublicContext = aztec::context::PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] = aztec::oracle::avm::calldata_copy(
                    1,
                    <AztecAddress as aztec::protocol::traits::Serialize>::N,
                );
                aztec::hash::hash_args(serialized_args)
            },
        );
        let storage: Storage<aztec::context::PublicContext> =
            Storage::<aztec::context::PublicContext>::init(context);

        assert(
            context.is_static_call(),
            "Function balance_of_public can only be called statically",
        );
        // MACRO CODE END

        storage.balances.at(owner).read()
    }

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    pub unconstrained fn public_dispatch(selector: Field) {
        if selector == INCREASE_PUBLIC_BALANCE_SELECTOR {
            let input_calldata: [Field; 2] = aztec::oracle::avm::calldata_copy(
                1,
                <AztecAddress as aztec::protocol::traits::Serialize>::N
                    + <u128 as aztec::protocol::traits::Serialize>::N,
            );
            let mut reader: aztec::protocol::utils::reader::Reader<2> =
                aztec::protocol::utils::reader::Reader::<2>::new(input_calldata);
            let arg0: AztecAddress = reader.read_struct(
                <AztecAddress as aztec::protocol::traits::Deserialize>::deserialize,
            );
            let arg1: u128 =
                reader.read_struct(<u128 as aztec::protocol::traits::Deserialize>::deserialize);
            _increase_public_balance(arg0, arg1);
            aztec::oracle::avm::avm_return([].as_vector());
        };
        if selector == CHECK_BALANCE_SELECTOR {
            let input_calldata: [Field; 1] = aztec::oracle::avm::calldata_copy(
                1,
                <u128 as aztec::protocol::traits::Serialize>::N,
            );
            let mut reader: aztec::protocol::utils::reader::Reader<1> =
                aztec::protocol::utils::reader::Reader::<1>::new(input_calldata);
            let arg0: u128 =
                reader.read_struct(<u128 as aztec::protocol::traits::Deserialize>::deserialize);
            check_balance(arg0);
            aztec::oracle::avm::avm_return([].as_vector());
        };
        if selector == BALANCE_OF_PUBLIC_SELECTOR {
            let input_calldata: [Field; 1] = aztec::oracle::avm::calldata_copy(
                1,
                <AztecAddress as aztec::protocol::traits::Serialize>::N,
            );
            let mut reader: aztec::protocol::utils::reader::Reader<1> =
                aztec::protocol::utils::reader::Reader::<1>::new(input_calldata);
            let arg0: AztecAddress = reader.read_struct(
                <AztecAddress as aztec::protocol::traits::Deserialize>::deserialize,
            );
            let return_value: [Field; 1] =
                <u128 as aztec::protocol::traits::Serialize>::serialize(balance_of_public(arg0));
            aztec::oracle::avm::avm_return(return_value.as_vector());
        };
        panic(f"Unknown selector {selector}")
    }

    pub struct StorageLayoutFields {
        pub balances: aztec::state_vars::Storable,
    }

    pub struct StorageLayout<let N: u32> {
        pub contract_name: str<N>,
        pub fields: StorageLayoutFields,
    }

    #[abi(storage)]
    pub global STORAGE_LAYOUT_FeeJuice: StorageLayout<8> = StorageLayout::<8> {
        contract_name: "FeeJuice",
        fields: StorageLayoutFields { balances: aztec::state_vars::Storable { slot: 1 } },
    };

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Self {
                balances: <Map<AztecAddress, PublicMutable<u128, Context>, Context> as aztec::state_vars::StateVariable<1, Context>>::new(
                    context,
                    1,
                ),
            }
        }
    }
    pub struct _increase_public_balance_parameters {
        pub _to: AztecAddress,
        pub _amount: u128,
    }

    pub struct balance_of_public_parameters {
        pub _owner: AztecAddress,
    }

    pub struct check_balance_parameters {
        pub _fee_limit: u128,
    }

    pub struct claim_and_end_setup_parameters {
        pub _to: AztecAddress,
        pub _amount: u128,
        pub _secret: Field,
        pub _message_leaf_index: Field,
    }

    pub struct claim_parameters {
        pub _to: AztecAddress,
        pub _amount: u128,
        pub _secret: Field,
        pub _message_leaf_index: Field,
    }

    #[abi(functions)]
    pub struct _increase_public_balance_abi {
        parameters: _increase_public_balance_parameters,
    }

    #[abi(functions)]
    pub struct balance_of_public_abi {
        parameters: balance_of_public_parameters,
        return_type: u128,
    }

    #[abi(functions)]
    pub struct check_balance_abi {
        parameters: check_balance_parameters,
    }

    #[abi(functions)]
    pub struct claim_abi {
        parameters: claim_parameters,
    }

    #[abi(functions)]
    pub struct claim_and_end_setup_abi {
        parameters: claim_and_end_setup_parameters,
    }
}
