mod events;
mod validate_bytecode;

/// Protocol contract that tracks which contract classes have been published to the network.
///
/// In Aztec, contracts are split into *classes* and *instances* (deployments of a class at a unique address). This
/// contract handles publishing of contract classes.
///
/// Every contract class must be registered here before any instance of that class can be deployed via the
/// ContractInstanceRegistry - this applies even to contracts with no public functions. Registration is also
/// a prerequisite for contract upgrades: the *new* class must be published before an existing deployed contract
/// instance can update its class id (a contract instance that is not registered in ContractInstanceRegistry cannot
/// be upgraded).
///
/// Registration works by emitting a nullifier keyed to the contract class id. Other protocol contracts
/// (e.g. ContractInstanceRegistry) verify registration by asserting this nullifier exists.
///
/// Contracts with public functions need to have their bytecode published in order for for the sequencer to be
/// guaranteed to be able to execute a public function (this is achieved by checking contract instance address
/// nullifier exists by the AVM - see ContractInstanceRegistry for more details). ACIR of private functions does not
/// need to be published here as private functions are executed on user devices.
pub contract ContractClassRegistry {
    use crate::events::class_published::ContractClassPublished;
    use crate::validate_bytecode::validate_packed_public_bytecode;
    use aztec::{
        oracle::capsules,
        protocol::{
            address::AztecAddress,
            constants::{CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS},
            contract_class_id::ContractClassId,
            traits::ToField,
        },
    };

    /// Publishes a contract class to the network.
    ///
    /// The caller provides the three components of the contract class id (artifact_hash, private_functions_root,
    /// public_bytecode_commitment) together with the packed public bytecode loaded via a capsule. Even contracts with
    /// no public functions have non-empty bytecode because the AVM transpiler adds a public dispatch function that
    /// simply reverts. Without it, publishing would fail due to the non-zero bytecode length check in
    /// `compute_public_bytecode_commitment`.
    ///
    /// Note that there is only one public bytecode commitment per contract instead of per contract-function as
    /// bytecode of public functions is merged into one `public_dispatch` function and the relevant code branch is then
    /// executed based on the function selector.
    ///
    /// This function:
    /// 1. Validates the packed bytecode against the provided commitment.
    /// 2. Recomputes and emits the contract class id as a nullifier (preventing duplicate registration and serving as
    /// a proof of publication).
    /// 3. Broadcasts a `ContractClassPublished` event containing the full class metadata and bytecode so that nodes
    /// can reconstruct the class.
    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn publish(
        inputs: aztec::context::inputs::PrivateContextInputs,
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body, I have removed that check.
        aztec::oracle::version::assert_compatible_oracle_version();

        let serialized_params: [Field; 3] = [artifact_hash, private_functions_root, public_bytecode_commitment];

        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext = aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Safety: We load the bytecode via a capsule, which is unconstrained. In order to ensure the loaded bytecode
        // matches the expected one, we recompute the commitment and assert it matches the one provided by the caller.
        let packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
                AztecAddress::zero(),
            )
                .unwrap()
        };

        validate_packed_public_bytecode(packed_public_bytecode, public_bytecode_commitment);

        // Compute contract class id from preimage
        let contract_class_id = ContractClassId::compute(
            artifact_hash,
            private_functions_root,
            public_bytecode_commitment,
        );

        // Emit the contract class id as a nullifier:
        // - to demonstrate that this contract class hasn't been published before
        // - to enable apps to read that this contract class has been published.
        // We use no domain separators because these are the only nullifiers this contract uses.
        context.push_nullifier(contract_class_id.to_field());

        // Broadcast class info including public bytecode
        aztec::oracle::logging::debug_log_format(
            "ContractClassPublished: {}",
            [contract_class_id.to_field(), artifact_hash, private_functions_root, public_bytecode_commitment],
        );

        let event = ContractClassPublished {
            contract_class_id,
            version: 1,
            artifact_hash,
            private_functions_root,
            packed_public_bytecode,
        };
        context.emit_contract_class_log(event.serialize_non_standard());

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    pub struct publish_parameters {
        pub _artifact_hash: Field,
        pub _private_functions_root: Field,
        pub _public_bytecode_commitment: Field,
    }

    #[abi(functions)]
    pub struct publish_abi {
        parameters: publish_parameters,
    }
}
