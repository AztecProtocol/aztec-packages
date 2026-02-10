/**
 * @title ContractInstanceRegistry Contract
 * @notice Manages the registration and updating of contract instances
 * @dev This contract allows deploying new contract instances and updating their class IDs
 */
pub contract ContractInstanceRegistry {
    use aztec::{
        context::{PrivateContext, PublicContext},
        hash::hash_args,
        nullifier::utils::compute_nullifier_existence_request,
        oracle::{avm, debug_log::debug_log_format, version::assert_compatible_oracle_version},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, PartialAddress},
            constants::{
                CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS, CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
                CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE, DEFAULT_UPDATE_DELAY, MINIMUM_UPDATE_DELAY,
            },
            contract_class_id::ContractClassId,
            point::validate_on_curve,
            public_keys::PublicKeys,
            traits::{Deserialize, Serialize, ToField},
            utils::reader::Reader,
        },
        state_vars::{DelayedPublicMutable, Map, StateVariable},
    };

    #[abi(events)]
    struct ContractInstancePublished {
        CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE: Field,
        address: AztecAddress,
        version: u8,
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        deployer: AztecAddress,
    }

    // We need to impl this separately because ts deserializes a point as two fields only.
    // We had issues that:
    // Notice how the 'is_infinite' field is deserialized as the next point.
    // {
    //     masterNullifierPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000012>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000034>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterIncomingViewingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000000>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000056>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterOutgoingViewingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000078>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000000000>,
    //   isInfinite: false,
    //   kind: 'point'
    // },
    // masterTaggingPublicKey: Point {
    //   x: Fr<0x0000000000000000000000000000000000000000000000000000000000000910>,
    //   y: Fr<0x0000000000000000000000000000000000000000000000000000000000001112>,
    //   isInfinite: false,
    //   kind: 'point'
    // }

    impl ContractInstancePublished {
        fn serialize_non_standard(self) -> [Field; 15] {
            [
                self.CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
                self.address.to_field(),
                self.version.to_field(),
                self.salt,
                self.contract_class_id.to_field(),
                self.initialization_hash,
                self.public_keys.npk_m.serialize()[0],
                self.public_keys.npk_m.serialize()[1],
                self.public_keys.ivpk_m.serialize()[0],
                self.public_keys.ivpk_m.serialize()[1],
                self.public_keys.ovpk_m.serialize()[0],
                self.public_keys.ovpk_m.serialize()[1],
                self.public_keys.tpk_m.serialize()[0],
                self.public_keys.tpk_m.serialize()[1],
                self.deployer.to_field(),
            ]
        }
    }

    #[abi(events)]
    #[derive(Serialize)]
    struct ContractInstanceUpdated {
        CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE: Field,
        address: AztecAddress,
        prev_contract_class_id: ContractClassId,
        new_contract_class_id: ContractClassId,
        timestamp_of_change: u64,
    }

    struct Storage<Context> {
        updated_class_ids: Map<AztecAddress, DelayedPublicMutable<ContractClassId, DEFAULT_UPDATE_DELAY, Context>, Context>,
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn publish_for_public_execution(
        inputs: aztec::context::inputs::PrivateContextInputs,
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        universal_deploy: bool,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body, I have removed that check.
        assert_compatible_oracle_version();

        let serialized_params: [Field; 16] = [
            salt,
            contract_class_id.to_field(),
            initialization_hash,
        ]
            .concat(public_keys.serialize())
            .concat([universal_deploy.to_field()]);

        let args_hash: Field = hash_args(serialized_params);
        let mut context: PrivateContext = PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Verify that the contract class is registered
        let nullifier_existence_request = compute_nullifier_existence_request(
            contract_class_id.to_field(),
            CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
        );
        context.assert_nullifier_exists(nullifier_existence_request);

        // Determine the deployer based on universal_deploy flag
        let deployer = if universal_deploy {
            AztecAddress::zero()
        } else {
            context.maybe_msg_sender().unwrap()
        };

        let partial_address =
            PartialAddress::compute(contract_class_id, salt, initialization_hash, deployer);

        // Note: Out of all the public keys, only the Ivpk_m is checked to be on the curve
        // (implicitly as part of the `add` operation of deriving the address). This at least
        // protects the AVM against DoS attacks.
        // For thoroughness, we also ensure the other points are on the curve:
        validate_on_curve(public_keys.npk_m.inner);
        validate_on_curve(public_keys.ovpk_m.inner);
        validate_on_curve(public_keys.tpk_m.inner);

        let address = AztecAddress::compute(public_keys, partial_address);

        // Emit the address as a nullifier:
        // - to demonstrate that this contract instance hasn't been published before
        // - to enable apps to read that this contract instance has been published.
        context.push_nullifier(address.to_field());

        // Emit the deployment event
        let event = ContractInstancePublished {
            CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
            contract_class_id,
            address,
            public_keys,
            initialization_hash,
            salt,
            deployer,
            version: 1,
        };
        let payload = event.serialize_non_standard();
        debug_log_format("ContractInstancePublished: {}", payload);
        let padded_log = payload.concat([0; 3]);
        let length = payload.len();
        context.emit_private_log(padded_log, length);

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn update(new_contract_class_id: ContractClassId) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] =
                    avm::calldata_copy(1, <ContractClassId as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        // MACRO CODE END

        let address = context.maybe_msg_sender().unwrap();

        // Safety: we're using the nullifier's existence as a guarantee of the availability of the contract's
        // information through publishing, which is safe - we just need this information to be _eventually_ available.
        assert(
            context.nullifier_exists_unsafe(address.to_field(), context.this_address()),
            "msg.sender is not deployed",
        );

        // Safety: we're using the nullifier's existence as a guarantee of the availability of the new contract class'
        // information through registration, which is safe - we just need this information to be _eventually_ available.
        assert(
            context.nullifier_exists_unsafe(
                new_contract_class_id.to_field(),
                CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
            ),
            "New contract class is not registered",
        );

        let scheduled_value_update = storage
            .updated_class_ids
            .at(address)
            .schedule_and_return_value_change(new_contract_class_id);
        let (prev_contract_class_id, timestamp_of_change) = scheduled_value_update.get_previous();

        let event = ContractInstanceUpdated {
            CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE,
            address,
            prev_contract_class_id,
            new_contract_class_id,
            timestamp_of_change,
        };
        context.emit_public_log(event);
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn set_update_delay(new_update_delay: u64) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] = avm::calldata_copy(1, <u64 as Serialize>::N);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        // MACRO CODE END

        let msg_sender = context.maybe_msg_sender().unwrap();

        // Safety: we're using the nullifier's existence as a guarantee of the availability of the contract's
        // information through publishing, which is safe - we just need this information to be _eventually_ available.
        assert(
            context.nullifier_exists_unsafe(msg_sender.to_field(), context.this_address()),
            "msg.sender is not deployed",
        );

        assert(new_update_delay >= MINIMUM_UPDATE_DELAY, "New update delay is too low");

        storage.updated_class_ids.at(msg_sender).schedule_delay_change(new_update_delay);
    }

    /**
     * Gets the current update delay for the caller's contract instance.
     *
     * @return The current update delay value
     */
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_view]
    unconstrained fn get_update_delay() -> pub u64 {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 0] = avm::calldata_copy(1, 0);
                hash_args(serialized_args)
            },
        );
        let storage: Storage<PublicContext> = Storage::init(context);
        assert(context.is_static_call(), "Function get_update_delay can only be called statically");
        // MACRO CODE END

        storage.updated_class_ids.at(avm::sender()).get_current_delay()
    }

    // // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    // Function selectors computed at comptime from function signatures
    global UPDATE_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("update((Field))").to_field() };
    global SET_UPDATE_DELAY_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("set_update_delay(u64)").to_field() };
    global GET_UPDATE_DELAY_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("get_update_delay()").to_field() };

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    pub unconstrained fn public_dispatch(selector: Field) {
        if selector == UPDATE_SELECTOR {
            let input_calldata: [Field; 1] =
                avm::calldata_copy(1, <ContractClassId as Serialize>::N);
            let mut reader: Reader<1> = Reader::new(input_calldata);
            let arg0: ContractClassId =
                <ContractClassId as Deserialize>::stream_deserialize(&mut reader);
            update(arg0);
            avm::avm_return([].as_vector());
        };
        if selector == SET_UPDATE_DELAY_SELECTOR {
            let input_calldata: [Field; 1] = avm::calldata_copy(1, <u64 as Serialize>::N);
            let mut reader: Reader<1> = Reader::new(input_calldata);
            let arg0: u64 = <u64 as Deserialize>::stream_deserialize(&mut reader);
            set_update_delay(arg0);
            avm::avm_return([].as_vector());
        };
        if selector == GET_UPDATE_DELAY_SELECTOR {
            let return_value: [Field; 1] = <u64 as Serialize>::serialize(get_update_delay());
            avm::avm_return(return_value.as_vector());
        };
        panic(f"Unknown selector {selector}")
    }

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Self {
                updated_class_ids: <Map<AztecAddress, DelayedPublicMutable<ContractClassId, DEFAULT_UPDATE_DELAY, Context>, Context> as StateVariable<1, Context>>::new(
                    context,
                    1,
                ),
            }
        }
    }

    // Parameter structs for ABI
    pub struct publish_for_public_execution_parameters {
        pub _salt: Field,
        pub _contract_class_id: ContractClassId,
        pub _initialization_hash: Field,
        pub _public_keys: PublicKeys,
        pub _universal_deploy: bool,
    }

    pub struct update_parameters {
        pub _new_contract_class_id: ContractClassId,
    }

    pub struct set_update_delay_parameters {
        pub _new_update_delay: u64,
    }

    pub struct get_update_delay_parameters {}

    // ABI structs
    #[abi(functions)]
    pub struct publish_for_public_execution_abi {
        parameters: publish_for_public_execution_parameters,
    }

    #[abi(functions)]
    pub struct update_abi {
        parameters: update_parameters,
    }

    #[abi(functions)]
    pub struct set_update_delay_abi {
        parameters: set_update_delay_parameters,
    }

    #[abi(functions)]
    pub struct get_update_delay_abi {
        parameters: get_update_delay_parameters,
        return_type: u64,
    }
}
