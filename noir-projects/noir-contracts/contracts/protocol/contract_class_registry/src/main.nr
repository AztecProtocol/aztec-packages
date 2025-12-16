mod events;

use dep::aztec::macros::aztec;

#[aztec]
pub contract ContractClassRegistry {
    use dep::aztec::{
        hash::compute_public_bytecode_commitment,
        macros::functions::private,
        protocol_types::{
            constants::{
                ARTIFACT_FUNCTION_TREE_MAX_HEIGHT, CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
                FUNCTION_TREE_HEIGHT, MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
                MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS,
                MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
            },
            contract_class_id::ContractClassId,
            traits::ToField,
        },
    };

    use crate::events::{
        class_published::ContractClassPublished,
        private_function_broadcasted::{
            ClassPrivateFunctionBroadcasted, InnerPrivateFunction, PrivateFunction,
        },
        utility_function_broadcasted::{
            ClassUtilityFunctionBroadcasted, InnerUtilityFunction, UtilityFunction,
        },
    };

    use dep::aztec::oracle::capsules;

    #[private]
    fn publish(
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field,
    ) {
        // Safety: We load the bytecode via a capsule, which is unconstrained. In order to ensure the loaded bytecode
        // matches the expected one, we recompute the commitment and assert it matches the one provided by the caller.
        let mut packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] = unsafe {
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
        dep::aztec::oracle::debug_log::debug_log_format(
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
    }

    #[private]
    fn broadcast_private_function(
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        utility_functions_artifact_tree_root: Field,
        private_function_tree_sibling_path: [Field; FUNCTION_TREE_HEIGHT],
        private_function_tree_leaf_index: Field,
        artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerPrivateFunction,
    ) {
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
            utility_functions_artifact_tree_root,
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
        dep::aztec::oracle::debug_log::debug_log_format(
            "ClassPrivateFunctionBroadcasted: {}",
            [
                contract_class_id.to_field(),
                artifact_metadata_hash,
                utility_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.vk_hash,
                function_data.metadata_hash,
            ],
        );
        context.emit_contract_class_log(event.serialize_non_standard());
    }

    #[private]
    fn broadcast_utility_function(
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        private_functions_artifact_tree_root: Field,
        artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerUtilityFunction,
    ) {
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
            private_functions_artifact_tree_root,
            artifact_function_tree_sibling_path,
            artifact_function_tree_leaf_index,
            function: UtilityFunction {
                selector: function_data.selector,
                metadata_hash: function_data.metadata_hash,
                bytecode: utility_bytecode,
            },
        };
        dep::aztec::oracle::debug_log::debug_log_format(
            "ClassUtilityFunctionBroadcasted: {}",
            [
                contract_class_id.to_field(),
                artifact_metadata_hash,
                private_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.metadata_hash,
            ],
        );
        context.emit_contract_class_log(event.serialize_non_standard());
    }

    #[private]
    fn assert_class_id_is_published(contract_class_id: ContractClassId) {
        context.push_nullifier_read_request(contract_class_id.to_field());
    }
}
