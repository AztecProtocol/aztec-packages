/**
 * @title AuthRegistry Contract
 * @notice Manages authorization of public actions through authentication witnesses (authwits)
 * @dev This contract allows users to approve/reject public actions that can be performed on their behalf by other
 * addresses
 */
pub contract AuthRegistry {
    use aztec::{
        authwit::auth::{
            assert_current_call_valid_authwit, compute_authwit_message_hash, IS_VALID_SELECTOR,
        },
        context::{PrivateContext, PublicContext, UtilityContext},
        hash::{hash_args, hash_calldata_array},
        oracle::{avm, execution_cache, version::assert_compatible_oracle_version},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::AztecAddress,
            traits::{Deserialize, FromField, Serialize, ToField},
            utils::reader::Reader,
        },
        state_vars::{Map, PublicMutable, StateVariable},
    };

    struct Storage<Context> {
        /// Map of addresses that have rejected all actions
        reject_all: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        /// Nested map of approvers to their authorized message hashes
        /// First key is the approver address, second key is the message hash, value is authorization status
        approved_actions: Map<AztecAddress, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
    }

    /**
     * Updates the `authorized` value for `msg_sender` for `message_hash`.
     *
     * @param message_hash The message hash being authorized
     * @param authorize True if the caller is authorized to perform the message hash, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn set_authorized(message_hash: Field, authorize: bool) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 2] =
                    avm::calldata_copy(1, <Field as Serialize>::N + <bool as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        // MACRO CODE END

        storage.approved_actions.at(avm::sender()).at(message_hash).write(authorize);
    }

    /**
     * Updates the `reject_all` value for `msg_sender`.
     *
     * When `reject_all` is `true` any `consume` on `msg_sender` will revert.
     *
     * @param reject True if all actions should be rejected, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn set_reject_all(reject: bool) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] = avm::calldata_copy(1, <bool as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        // MACRO CODE END

        storage.reject_all.at(avm::sender()).write(reject);
    }

    /**
     * Consumes an `inner_hash` on behalf of `on_behalf_of` if the caller is authorized to do so.
     *
     * Will revert even if the caller is authorized if `reject_all` is set to true for `on_behalf_of`.
     * This is to support "mass-revoke".
     *
     * @param on_behalf_of The address on whose behalf the action is being consumed
     * @param inner_hash The inner_hash of the authwit
     * @return `IS_VALID_SELECTOR` if the action was consumed, revert otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn consume(on_behalf_of: AztecAddress, inner_hash: Field) -> pub Field {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 2] =
                    avm::calldata_copy(1, <AztecAddress as Serialize>::N + <Field as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        // MACRO CODE END

        assert_eq(false, storage.reject_all.at(on_behalf_of).read(), "rejecting all");

        let message_hash = compute_authwit_message_hash(
            context.maybe_msg_sender().unwrap(),
            context.chain_id(),
            context.version(),
            inner_hash,
        );

        let authorized = storage.approved_actions.at(on_behalf_of).at(message_hash).read();

        assert_eq(true, authorized, "unauthorized");
        storage.approved_actions.at(on_behalf_of).at(message_hash).write(false);

        IS_VALID_SELECTOR
    }

    /**
     * Updates a public authwit using a private authwit
     *
     * Useful for the case where you want someone else to insert a public authwit for you.
     * For example, if Alice wants Bob to insert an authwit in public, such that they can execute
     * a trade, Alice can create a private authwit, and Bob can call this function with it.
     *
     * @param approver The address of the approver (Alice in the example)
     * @param message_hash The message hash to authorize
     * @param authorize True if the message hash should be authorized, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn set_authorized_private(
        inputs: aztec::context::inputs::PrivateContextInputs,
        approver: AztecAddress,
        message_hash: Field,
        authorize: bool,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body or in the subsequent enqueued public function call, I have removed that check.
        assert_compatible_oracle_version();

        let serialized_params: [Field; 3] =
            [approver.to_field(), message_hash, authorize.to_field()];
        let args_hash: Field = hash_args(serialized_params);
        let mut context: PrivateContext = PrivateContext::new(inputs, args_hash);

        // MACRO CODE END

        // 3 corresponds to the number of arguments of the function
        assert_current_call_valid_authwit::<3>(&mut context, approver);

        // Enqueue call to _set_authorized
        // Note: This was originally just `self.enqueue_self._set_authorized(approver, message_hash, authorize);`
        // before de-macroification.
        {
            let enqueue_params: [Field; 3] =
                [approver.to_field(), message_hash, authorize.to_field()];
            let selector: FunctionSelector = FunctionSelector::from_field(_SET_AUTHORIZED_SELECTOR);
            let calldata: [Field; 4] = [selector.to_field()].concat(enqueue_params);
            let calldata_hash: Field = hash_calldata_array(calldata);
            execution_cache::store(calldata, calldata_hash);
            context.call_public_function_with_calldata_hash(
                context.this_address(),
                calldata_hash,
                false,
                false,
            );
        }

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    /**
     * Internal function to update the `authorized` value for `approver` for `messageHash`.
     * Used along with `set_authorized_private` to update the public authwit.
     *
     * @param approver The address of the approver
     * @param message_hash The message hash being authorized
     * @param authorize True if the caller is authorized to perform the message hash, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_only_self]
    unconstrained fn _set_authorized(approver: AztecAddress, message_hash: Field, authorize: bool) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 3] = avm::calldata_copy(
                    1,
                    (<AztecAddress as Serialize>::N + <Field as Serialize>::N)
                        + <bool as Serialize>::N,
                );
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);

        // Originally injected by the #[only_self] macro
        assert(
            avm::sender() == context.this_address(),
            "Function _set_authorized can only be called by the same contract",
        );
        // MACRO CODE END

        storage.approved_actions.at(approver).at(message_hash).write(authorize);
    }

    /**
     * Fetches the `reject_all` value for `on_behalf_of`.
     *
     * @param on_behalf_of The address to check
     * @return True if all actions are rejected, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_view]
    unconstrained fn is_reject_all(on_behalf_of: AztecAddress) -> pub bool {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] =
                    avm::calldata_copy(1, <AztecAddress as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);

        // Originally injected by the #[view] macro
        assert(context.is_static_call(), "Function is_reject_all can only be called statically");
        // MACRO CODE END

        storage.reject_all.at(on_behalf_of).read()
    }

    /**
     * Fetches the `authorized` value for `on_behalf_of` for `message_hash`.
     *
     * @param on_behalf_of The address on whose behalf the action is being consumed
     * @param message_hash The message hash to check
     * @return True if the caller is authorized to perform the action, false otherwise
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_view]
    unconstrained fn is_consumable(on_behalf_of: AztecAddress, message_hash: Field) -> pub bool {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 2] =
                    avm::calldata_copy(1, <AztecAddress as Serialize>::N + <Field as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);

        // Originally injected by the #[view] macro
        assert(context.is_static_call(), "Function is_consumable can only be called statically");
        // MACRO CODE END

        storage.approved_actions.at(on_behalf_of).at(message_hash).read()
    }

    /**
     * Just like `is_consumable`, but a utility function and not public.
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_utility]
    unconstrained fn utility_is_consumable(
        on_behalf_of: AztecAddress,
        message_hash: Field,
    ) -> pub bool {
        // MACRO CODE START
        assert_compatible_oracle_version();

        let context: UtilityContext = UtilityContext::new();
        let storage: Storage<UtilityContext> = Storage::init(context);
        // MACRO CODE END

        storage.approved_actions.at(on_behalf_of).at(message_hash).read()
    }

    // // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    // Function selectors computed at comptime from function signatures
    global SET_AUTHORIZED_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("set_authorized(Field,bool)").to_field() };
    global SET_REJECT_ALL_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("set_reject_all(bool)").to_field() };
    global CONSUME_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("consume((Field),Field)").to_field() };
    global _SET_AUTHORIZED_SELECTOR: Field = comptime {
        FunctionSelector::from_signature("_set_authorized((Field),Field,bool)").to_field()
    };
    global IS_REJECT_ALL_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("is_reject_all((Field))").to_field() };
    global IS_CONSUMABLE_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("is_consumable((Field),Field)").to_field() };

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    pub unconstrained fn public_dispatch(selector: Field) {
        if selector == SET_AUTHORIZED_SELECTOR {
            let input_calldata: [Field; 2] =
                avm::calldata_copy(1, <Field as Serialize>::N + <bool as Serialize>::N);
            let mut reader: Reader<2> = Reader::new(input_calldata);
            let arg0: Field = <Field as Deserialize>::stream_deserialize(&mut reader);
            let arg1: bool = <bool as Deserialize>::stream_deserialize(&mut reader);
            set_authorized(arg0, arg1);
            avm::avm_return([].as_vector());
        };
        if selector == SET_REJECT_ALL_SELECTOR {
            let input_calldata: [Field; 1] = avm::calldata_copy(1, <bool as Serialize>::N);
            let mut reader: Reader<1> = Reader::new(input_calldata);
            let arg0: bool = <bool as Deserialize>::stream_deserialize(&mut reader);
            set_reject_all(arg0);
            avm::avm_return([].as_vector());
        };
        if selector == CONSUME_SELECTOR {
            let input_calldata: [Field; 2] =
                avm::calldata_copy(1, <AztecAddress as Serialize>::N + <Field as Serialize>::N);
            let mut reader: Reader<2> = Reader::new(input_calldata);
            let arg0: AztecAddress = <AztecAddress as Deserialize>::stream_deserialize(&mut reader);
            let arg1: Field = <Field as Deserialize>::stream_deserialize(&mut reader);
            let return_value: [Field; 1] = <Field as Serialize>::serialize(consume(arg0, arg1));
            avm::avm_return(return_value.as_vector());
        };
        if selector == _SET_AUTHORIZED_SELECTOR {
            let input_calldata: [Field; 3] = avm::calldata_copy(
                1,
                (<AztecAddress as Serialize>::N + <Field as Serialize>::N) + <bool as Serialize>::N,
            );
            let mut reader: Reader<3> = Reader::new(input_calldata);
            let arg0: AztecAddress = <AztecAddress as Deserialize>::stream_deserialize(&mut reader);
            let arg1: Field = <Field as Deserialize>::stream_deserialize(&mut reader);
            let arg2: bool = <bool as Deserialize>::stream_deserialize(&mut reader);
            _set_authorized(arg0, arg1, arg2);
            avm::avm_return([].as_vector());
        };
        if selector == IS_REJECT_ALL_SELECTOR {
            let input_calldata: [Field; 1] = avm::calldata_copy(1, <AztecAddress as Serialize>::N);
            let mut reader: Reader<1> = Reader::new(input_calldata);
            let arg0: AztecAddress = <AztecAddress as Deserialize>::stream_deserialize(&mut reader);
            let return_value: [Field; 1] = <bool as Serialize>::serialize(is_reject_all(arg0));
            avm::avm_return(return_value.as_vector());
        };
        if selector == IS_CONSUMABLE_SELECTOR {
            let input_calldata: [Field; 2] =
                avm::calldata_copy(1, <AztecAddress as Serialize>::N + <Field as Serialize>::N);
            let mut reader: Reader<2> = Reader::new(input_calldata);
            let arg0: AztecAddress = <AztecAddress as Deserialize>::stream_deserialize(&mut reader);
            let arg1: Field = <Field as Deserialize>::stream_deserialize(&mut reader);
            let return_value: [Field; 1] =
                <bool as Serialize>::serialize(is_consumable(arg0, arg1));
            avm::avm_return(return_value.as_vector());
        };
        panic(f"Unknown selector {selector}")
    }

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Self {
                reject_all: <Map<AztecAddress, PublicMutable<bool, Context>, Context> as StateVariable<1, Context>>::new(
                    context,
                    1,
                ),
                approved_actions: <Map<AztecAddress, Map<Field, PublicMutable<bool, Context>, Context>, Context> as StateVariable<1, Context>>::new(
                    context,
                    2,
                ),
            }
        }
    }

    // Parameter structs for ABI
    pub struct _set_authorized_parameters {
        pub _approver: AztecAddress,
        pub _message_hash: Field,
        pub _authorize: bool,
    }

    pub struct consume_parameters {
        pub _on_behalf_of: AztecAddress,
        pub _inner_hash: Field,
    }

    pub struct is_consumable_parameters {
        pub _on_behalf_of: AztecAddress,
        pub _message_hash: Field,
    }

    pub struct is_reject_all_parameters {
        pub _on_behalf_of: AztecAddress,
    }

    pub struct set_authorized_parameters {
        pub _message_hash: Field,
        pub _authorize: bool,
    }

    pub struct set_authorized_private_parameters {
        pub _approver: AztecAddress,
        pub _message_hash: Field,
        pub _authorize: bool,
    }

    pub struct set_reject_all_parameters {
        pub _reject: bool,
    }

    pub struct utility_is_consumable_parameters {
        pub _on_behalf_of: AztecAddress,
        pub _message_hash: Field,
    }

    // ABI structs
    #[abi(functions)]
    pub struct _set_authorized_abi {
        parameters: _set_authorized_parameters,
    }

    #[abi(functions)]
    pub struct consume_abi {
        parameters: consume_parameters,
        return_type: Field,
    }

    #[abi(functions)]
    pub struct is_consumable_abi {
        parameters: is_consumable_parameters,
        return_type: bool,
    }

    #[abi(functions)]
    pub struct is_reject_all_abi {
        parameters: is_reject_all_parameters,
        return_type: bool,
    }

    #[abi(functions)]
    pub struct set_authorized_abi {
        parameters: set_authorized_parameters,
    }

    #[abi(functions)]
    pub struct set_authorized_private_abi {
        parameters: set_authorized_private_parameters,
    }

    #[abi(functions)]
    pub struct set_reject_all_abi {
        parameters: set_reject_all_parameters,
    }

    #[abi(functions)]
    pub struct utility_is_consumable_abi {
        parameters: utility_is_consumable_parameters,
        return_type: bool,
    }
}
