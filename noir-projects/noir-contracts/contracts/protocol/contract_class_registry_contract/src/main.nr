mod events;

pub contract ContractClassRegistry {
    use crate::events::class_published::ContractClassPublished;
    use aztec::{
        hash::compute_public_bytecode_commitment,
        oracle::capsules,
        protocol::{
            constants::CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
            contract_class_id::ContractClassId, traits::ToField,
        },
    };

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

        let serialized_params: [Field; 3] =
            [artifact_hash, private_functions_root, public_bytecode_commitment];

        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext =
            aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Safety: We load the bytecode via a capsule, which is unconstrained. In order to ensure the loaded bytecode
        // matches the expected one, we recompute the commitment and assert it matches the one provided by the caller.
        let mut packed_public_bytecode: [Field; 3000] = unsafe {
            capsules::load(
                context.this_address(),
                CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
            )
                .unwrap()
        };
        // Compute and check the public bytecode commitment
        let computed_public_bytecode_commitment =
            compute_public_bytecode_commitment(packed_public_bytecode);
        assert_eq(computed_public_bytecode_commitment, public_bytecode_commitment);

        // Compute contract class id from preimage
        let contract_class_id = ContractClassId::compute(
            artifact_hash,
            private_functions_root,
            public_bytecode_commitment,
        );

        // Emit the contract class id as a nullifier:
        // - to demonstrate that this contract class hasn't been published before
        // - to enable apps to read that this contract class has been published.
        context.push_nullifier(contract_class_id.to_field());

        // Broadcast class info including public bytecode
        aztec::oracle::logging::debug_log_format(
            "ContractClassPublished: {}",
            [
                contract_class_id.to_field(),
                artifact_hash,
                private_functions_root,
                public_bytecode_commitment,
            ],
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
