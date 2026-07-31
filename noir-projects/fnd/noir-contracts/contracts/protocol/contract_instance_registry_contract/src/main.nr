/// Protocol contract responsible for deploying contract instances and managing contract upgrades.
///
/// In Aztec, contracts are split into *classes* (code, registered via ContractClassRegistry) and *instances*
/// (deployments of a class at a unique address). This contract handles contract instance publishing and contract
/// updates (updating instance to a new class).
pub contract ContractInstanceRegistry {
    use aztec::{
        context::{PrivateContext, PublicContext},
        hash::hash_args,
        nullifier::utils::compute_nullifier_existence_request,
        oracle::{avm, logging::debug_log_format, version::assert_compatible_oracle_version},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, PartialAddress},
            constants::{
                CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS, CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
                CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE, DEFAULT_UPDATE_DELAY, MINIMUM_UPDATE_DELAY,
            },
            contract_class_id::ContractClassId,
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
        immutables_hash: Field,
        public_keys: PublicKeys,
        deployer: AztecAddress,
    }

    // Custom serialization is required because:
    // - npk_m, ovpk_m, tpk_m, mspk_m, fbpk_m are exposed only as hashes so we serialize the hashes
    //   directly.
    // - For ivpk_m we drop the `is_infinite` flag (we assume non-infinity).
    impl ContractInstancePublished {
        fn serialize_non_standard(self) -> [Field; 15] {
            [
                self.CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
                self.address.to_field(),
                self.version.to_field(),
                self.salt,
                self.contract_class_id.to_field(),
                self.initialization_hash,
                self.immutables_hash,
                self.public_keys.npk_m_hash,
                self.public_keys.ivpk_m.inner.x,
                self.public_keys.ivpk_m.inner.y,
                self.public_keys.ovpk_m_hash,
                self.public_keys.tpk_m_hash,
                self.public_keys.mspk_m_hash,
                self.public_keys.fbpk_m_hash,
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
        /// Map from contract instance address to a `DelayedPublicMutable` holding the updated contract class ID.
        updated_class_ids: Map<AztecAddress, DelayedPublicMutable<ContractClassId, DEFAULT_UPDATE_DELAY, Context>, Context>,
    }

    /// Publishes a new contract instance.
    ///
    /// The caller provides deployment parameters (salt, class_id, init_hash, immutables_hash, public_keys,
    /// universal_deploy).
    /// The `universal_deploy` flag controls whether the deployer address is bound into the contract address:
    /// when true, deployer is zero (anyone can deploy the same instance); when false, deployer is the caller.
    ///
    /// This function:
    /// 1. Verifies the contract class is registered in ContractClassRegistry (nullifier existence check).
    /// 2. Validates `ivpk_m` is on the Grumpkin curve and not the point at infinity (preventing AVM DoS via an invalid
    /// point). `npk_m`, `ovpk_m`, `tpk_m`, `mspk_m`, and `fbpk_m` are exposed only as hashes and are not validated
    /// in-circuit.
    /// 3. Computes the deterministic contract address from the deployment parameters.
    /// 4. Emits the address as a nullifier (proving publication preventing duplicate deployment)
    ///    --> this address nullifier is then checked to exist by the AVM upon public function execution (if it doesn't
    ///        exist AVM reverts)
    /// 5. Broadcasts a `ContractInstancePublished` event so nodes can reconstruct the instance.
    // Mirrors the private entrypoint the aztec-nr macro generates: PrivateCircuitPublicInputs has constant fields
    // that cannot be dropped from the protocol ABI.
    #[allow(constant_return)]
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn publish_for_public_execution(
        inputs: aztec::context::inputs::PrivateContextInputs,
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        immutables_hash: Field,
        public_keys: PublicKeys,
        universal_deploy: bool,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body, I have removed that check.
        assert_compatible_oracle_version();

        // 4 prefix fields (salt, class_id, init_hash, immutables_hash) + 7 public-key fields
        // + 1 universal_deploy flag = 12.
        let serialized_params: [Field; 12] = [salt, contract_class_id.to_field(), initialization_hash, immutables_hash]
            .concat(public_keys.serialize())
            .concat([universal_deploy.to_field()]);

        let args_hash: Field = hash_args(serialized_params);
        let mut context: PrivateContext = PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Verify the contract class is registered by checking for its nullifier at the ContractClassRegistry address.
        let nullifier_existence_request = compute_nullifier_existence_request(
            contract_class_id.to_field(),
            CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
        );
        context.assert_nullifier_exists(nullifier_existence_request);

        // For universal deployments, deployer is zero so the resulting address is the same regardless of who initiates
        // deployment.
        let deployer = if universal_deploy {
            AztecAddress::zero()
        } else {
            context.maybe_msg_sender().unwrap()
        };

        let partial_address = PartialAddress::compute(
            contract_class_id,
            salt,
            initialization_hash,
            deployer,
            immutables_hash,
        );

        // Validate `ivpk_m` is on the Grumpkin curve and is not the point at infinity (preventing AVM
        // DoS attacks). The other five master keys are exposed as hashes and have no
        // curve-point to validate here.
        public_keys.validate_on_curve();
        public_keys.validate_non_infinity();

        let address = AztecAddress::compute(public_keys, partial_address);

        // Emit address as nullifier: prevents duplicate deployment and proves publication.
        // We use no domain separators because these are the only nullifiers this contract uses.
        context.push_nullifier(address.to_field());

        // Broadcast deployment event. Version 2 carries hashes for npk/ovpk/tpk/mspk/fbpk and the
        // affine coordinates of ivpk only; see `serialize_non_standard`.
        let event = ContractInstancePublished {
            CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
            contract_class_id,
            address,
            public_keys,
            initialization_hash,
            immutables_hash,
            salt,
            deployer,
            version: 2,
        };
        let payload = event.serialize_non_standard();
        debug_log_format("ContractInstancePublished: {}", payload);
        // We pad the payload with zeros to match the length required by emit_private_log (PRIVATE_LOG_SIZE_IN_FIELDS).
        // Since the log is not encrypted, padding with zero rather than a random value is acceptable (we don't care
        // about privacy here).
        let padded_log = payload.concat([0]);
        let length = payload.len();
        context.emit_private_log(padded_log, length);

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    /// Schedules an upgrade of the calling contract instance to a new contract class.
    ///
    /// The change is time-delayed via `DelayedPublicMutable` and only takes effect after the configured
    /// delay has elapsed. Only the contract instance itself can call this function (msg.sender == address).
    ///
    /// This function:
    /// 1. Verifies msg.sender is a deployed contract (its address nullifier exists).
    /// 2. Verifies the new class is registered in ContractClassRegistry.
    /// 3. Schedules the class ID change and emits a `ContractInstanceUpdated` event.
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    unconstrained fn update(new_contract_class_id: ContractClassId) {
        // MACRO CODE START
        let context: PublicContext = PublicContext::new(
            || -> Field {
                let serialized_args: [Field; 1] = avm::calldata_copy(1, <ContractClassId as Serialize>::N);
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
        // information through registration, which is safe - we just need this information to be _eventually_
        // available.
        assert(
            context.nullifier_exists_unsafe(new_contract_class_id.to_field(), CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS),
            "New contract class is not registered",
        );

        let scheduled_value_update =
            storage.updated_class_ids.at(address).schedule_and_get_value_change(new_contract_class_id);
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

    /// Schedules a change to the upgrade delay for the calling contract instance. The delay change is
    /// itself delayed (preventing atomically reducing delay + scheduling an instant upgrade). The new
    /// delay must be at least `MINIMUM_UPDATE_DELAY`.
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

    /// Returns the current update delay for the calling contract instance.
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

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    global UPDATE_SELECTOR: Field = comptime { FunctionSelector::from_signature("update((Field))").to_field() };
    global SET_UPDATE_DELAY_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("set_update_delay(u64)").to_field() };
    global GET_UPDATE_DELAY_SELECTOR: Field =
        comptime { FunctionSelector::from_signature("get_update_delay()").to_field() };

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_public]
    pub unconstrained fn public_dispatch(selector: Field) {
        if selector == UPDATE_SELECTOR {
            let input_calldata: [Field; 1] = avm::calldata_copy(1, <ContractClassId as Serialize>::N);
            let mut reader: Reader<1> = Reader::new(input_calldata);
            let arg0: ContractClassId = <ContractClassId as Deserialize>::stream_deserialize(&mut reader);
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

    pub struct publish_for_public_execution_parameters {
        pub _salt: Field,
        pub _contract_class_id: ContractClassId,
        pub _initialization_hash: Field,
        pub _immutables_hash: Field,
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
