/// A contract that manages public authentication witnesses (authwits) on the Aztec network.
///
/// In Aztec, private authwits are verified by account contracts directly (via oracles on the user's device). Public
/// authwits, however, require this onchain registry because local oracles cannot be used for global execution. Users pre-approve
/// actions by storing `message_hash -> true` mappings via `set_authorized`, and consumer contracts verify and
/// atomically revoke these approvals via `consume`.
///
/// The `message_hash` includes the consumer address, chain ID, and protocol version, preventing cross-chain and
/// cross-contract replay. Each approval can only be consumed once. Users can also enable `reject_all` as an emergency
/// kill switch to invalidate all outstanding approvals at once.
///
/// A private-to-public bridge is provided via `set_authorized_private`: a user signs a private authwit, and any party
/// holding it can call this function to insert the corresponding public approval.
///
/// Note that there is no expiration time enforced on the approved actions in this contract as this can be achieved by
/// including an expiration timestamp in the `message` (`message_hash` preimage) and having the consumer contract
/// constrain that value.
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
        /// Per-address flag that, when true, causes all `consume` calls for that address to revert. Provides an
        /// emergency "mass revocation" mechanism. Does not delete existing approvals - if later set back to false,
        /// unconsumed approvals become consumable again.
        reject_all: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        /// Per-user, per-message authorization status. `approved_actions[user][message_hash]` is set to true by
        /// `set_authorized` and atomically revoked by `consume` to prevent replay.
        approved_actions: Map<AztecAddress, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
    }

    /// Approves or revokes a `message_hash` for the caller.
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

    /// Enables or disables mass rejection of all authwits for the caller. When enabled, all `consume` calls for the
    /// caller's address will revert regardless of individual approvals.
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

    /// Consumes (verifies and atomically revokes) an authorization on behalf of `on_behalf_of`.
    ///
    /// Called by consumer contracts (e.g. Token) to verify a user has authorized an action. This function:
    /// 1. Checks that `on_behalf_of` has not enabled `reject_all`.
    /// 2. Recomputes the `message_hash` from the caller (consumer), chain ID, version, and `inner_hash`, binding the
    ///    approval to this specific consumer contract.
    /// 3. Verifies the message was approved and atomically revokes it to prevent replay.
    ///
    /// Returns `IS_VALID_SELECTOR` (0x47dacd73) on success instead of a boolean. This follows the EIP-1271 pattern:
    /// a failed or malformed call would return the default zero value, which is indistinguishable from `false`. By
    /// requiring a specific magic value, the caller can reliably distinguish a successful validation from a failed
    /// call. The function also reverts on failure as a first line of defense, making the magic return value a
    /// defense-in-depth measure against subtle integration bugs on the caller side.
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

        // reject_all is checked first so it takes precedence over individual approvals.
        assert_eq(false, storage.reject_all.at(on_behalf_of).read(), "rejecting all");

        // The msg_sender here is the consumer contract, not the original user. This binds
        // the approval to a specific consumer, preventing cross-contract replay.
        let message_hash = compute_authwit_message_hash(
            context.maybe_msg_sender().unwrap(),
            context.chain_id(),
            context.version(),
            inner_hash,
        );

        let authorized = storage.approved_actions.at(on_behalf_of).at(message_hash).read();
        assert_eq(true, authorized, "unauthorized");
        // Revoke the approval to prevent replay.
        storage.approved_actions.at(on_behalf_of).at(message_hash).write(false);

        IS_VALID_SELECTOR
    }

    /// Bridges a private authwit into a public authorization entry.
    ///
    /// Allows any party to insert a public approval on behalf of `approver`, provided they present a valid private
    /// authwit from that approver. Useful when e.g. Alice wants Bob to insert a public authwit for her so they can
    /// execute a trade - Alice signs a private authwit and Bob calls this function.
    ///
    /// This function:
    /// 1. Verifies the approver's private authwit via `assert_current_call_valid_authwit` (static call + nullifier
    ///    emission to prevent replay).
    /// 2. Enqueues a public call to `_set_authorized` to write the approval during the public phase.
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

        // The generic parameter `3` is the number of function arguments (approver, message_hash, authorize).
        assert_current_call_valid_authwit::<3>(&mut context, approver);

        // Enqueue a public call to _set_authorized to write the approval into public storage.
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

    /// A function that writes an authorization entry for an arbitrary `approver`. Only callable by this contract
    /// itself (`#[only_self]`), ensuring it is only reachable through the validated `set_authorized_private` flow.
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

        assert(
            avm::sender() == context.this_address(),
            "Function _set_authorized can only be called by the same contract",
        );
        // MACRO CODE END

        storage.approved_actions.at(approver).at(message_hash).write(authorize);
    }

    /// Returns whether `on_behalf_of` has enabled the `reject_all` flag.
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

        assert(context.is_static_call(), "Function is_reject_all can only be called statically");
        // MACRO CODE END

        storage.reject_all.at(on_behalf_of).read()
    }

    /// Returns whether a specific `message_hash` is currently approved for `on_behalf_of`.
    /// Does NOT check the `reject_all` flag - also check `is_reject_all` for a complete picture.
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

        assert(context.is_static_call(), "Function is_consumable can only be called statically");
        // MACRO CODE END

        storage.approved_actions.at(on_behalf_of).at(message_hash).read()
    }

    /// Utility version of `is_consumable`
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

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

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
