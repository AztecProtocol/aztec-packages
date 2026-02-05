mod events;

// This contract stores the contract class information, including the public bytecode and the roots of the private and utility function trees. It also provides functions to broadcast private and utility functions, which are necessary for function execution but cannot be included in the public bytecode due to their size and privacy requirements.

pub contract ContractClassRegistry {
    use crate::events::{
        class_published::ContractClassPublished,
        private_function_broadcasted::{
            ClassPrivateFunctionBroadcasted, InnerPrivateFunction, PrivateFunction,
        },
        utility_function_broadcasted::{
            ClassUtilityFunctionBroadcasted, InnerUtilityFunction, UtilityFunction,
        },
    };
    use aztec::{
        hash::compute_public_bytecode_commitment,
        oracle::capsules,
        protocol::{
            constants::{
                CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
                MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
                MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS,
            },
            contract_class_id::ContractClassId,
            traits::{Serialize, ToField},
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
        aztec::oracle::debug_log::debug_log_format(
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

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn broadcast_private_function(
        inputs: aztec::context::inputs::PrivateContextInputs,
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        public_functions_artifact_tree_root: Field,
        private_function_tree_sibling_path: [Field; 7],
        private_function_tree_leaf_index: Field,
        artifact_function_tree_sibling_path: [Field; 7],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerPrivateFunction,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body, I have removed that check.
        aztec::oracle::version::assert_compatible_oracle_version();

        let serialized_params: [Field; 22] = [
            contract_class_id.to_field(),
            artifact_metadata_hash,
            public_functions_artifact_tree_root,
        ]
            .concat(private_function_tree_sibling_path)
            .concat([private_function_tree_leaf_index])
            .concat(artifact_function_tree_sibling_path)
            .concat([artifact_function_tree_leaf_index])
            .concat(function_data.serialize());

        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext =
            aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Safety: The bytecode loaded here is unconstrained, which is acceptable since:
        // 1. Unlike public functions, we don't need execution guarantees for private functions.
        // 2. This broadcast simply provides convenient bytecode sharing vs offchain distribution.
        // 3. Computing the VK for private bytecode in-circuit is not possible, so we can't do better.
        let private_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
            )
                .unwrap()
        };
        let event = ClassPrivateFunctionBroadcasted {
            contract_class_id,
            artifact_metadata_hash,
            public_functions_artifact_tree_root,
            private_function_tree_sibling_path,
            private_function_tree_leaf_index,
            artifact_function_tree_sibling_path,
            artifact_function_tree_leaf_index,
            function: PrivateFunction {
                selector: function_data.selector,
                metadata_hash: function_data.metadata_hash,
                vk_hash: function_data.vk_hash,
                bytecode: private_bytecode,
            },
        };
        aztec::oracle::debug_log::debug_log_format(
            "ClassPrivateFunctionBroadcasted: {}",
            [
                contract_class_id.to_field(),
                artifact_metadata_hash,
                public_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.vk_hash,
                function_data.metadata_hash,
            ],
        );
        context.emit_contract_class_log(event.serialize_non_standard());

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    #[aztec::macros::internals_functions_generation::abi_attributes::abi_private]
    fn broadcast_utility_function(
        inputs: aztec::context::inputs::PrivateContextInputs,
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        utility_functions_artifact_tree_root: Field,
        artifact_function_tree_sibling_path: [Field; 7],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerUtilityFunction,
    ) -> return_data aztec::protocol::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
        // MACRO CODE START
        // Note: The macros initially inserted a phase check here, but since there is no phase change in this function
        // body, I have removed that check.
        aztec::oracle::version::assert_compatible_oracle_version();

        let serialized_params: [Field; 13] = [
            contract_class_id.to_field(),
            artifact_metadata_hash,
            utility_functions_artifact_tree_root,
        ]
            .concat(artifact_function_tree_sibling_path)
            .concat([artifact_function_tree_leaf_index])
            .concat(function_data.serialize());

        let args_hash: Field = aztec::hash::hash_args(serialized_params);
        let mut context: aztec::context::PrivateContext =
            aztec::context::PrivateContext::new(inputs, args_hash);
        // MACRO CODE END

        // Safety: The bytecode loaded here is unconstrained, which is acceptable since:
        // 1. Unlike public functions, we don't need execution guarantees for utility functions.
        // 2. This broadcast simply provides convenient bytecode sharing vs offchain distribution.
        let utility_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
            )
                .unwrap()
        };
        let event = ClassUtilityFunctionBroadcasted {
            contract_class_id,
            artifact_metadata_hash,
            utility_functions_artifact_tree_root,
            artifact_function_tree_sibling_path,
            artifact_function_tree_leaf_index,
            function: UtilityFunction {
                selector: function_data.selector,
                metadata_hash: function_data.metadata_hash,
                bytecode: utility_bytecode,
            },
        };
        aztec::oracle::debug_log::debug_log_format(
            "ClassUtilityFunctionBroadcasted: {}",
            [
                contract_class_id.to_field(),
                artifact_metadata_hash,
                utility_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.metadata_hash,
            ],
        );
        context.emit_contract_class_log(event.serialize_non_standard());

        // MACRO CODE START
        context.finish()
        // MACRO CODE END
    }

    // THE REST OF THE CODE IN THIS CONTRACT WAS ORIGINALLY INJECTED BY THE #[aztec] MACRO.

    pub struct broadcast_private_function_parameters {
        pub _contract_class_id: ContractClassId,
        pub _artifact_metadata_hash: Field,
        pub _private_functions_artifact_tree_root: Field,
        pub _private_function_tree_sibling_path: [Field; 7],
        pub _private_function_tree_leaf_index: Field,
        pub _artifact_function_tree_sibling_path: [Field; 7],
        pub _artifact_function_tree_leaf_index: Field,
        pub _function_data: InnerPrivateFunction,
    }

    pub struct broadcast_utility_function_parameters {
        pub _contract_class_id: ContractClassId,
        pub _artifact_metadata_hash: Field,
        pub _utility_functions_artifact_tree_root: Field,
        pub _artifact_function_tree_sibling_path: [Field; 7],
        pub _artifact_function_tree_leaf_index: Field,
        pub _function_data: InnerUtilityFunction,
    }

    pub struct publish_parameters {
        pub _artifact_hash: Field,
        pub _private_functions_root: Field,
        pub _public_bytecode_commitment: Field,
    }

    #[abi(functions)]
    pub struct broadcast_private_function_abi {
        parameters: broadcast_private_function_parameters,
    }

    #[abi(functions)]
    pub struct broadcast_utility_function_abi {
        parameters: broadcast_utility_function_parameters,
    }

    #[abi(functions)]
    pub struct publish_abi {
        parameters: publish_parameters,
    }
}
