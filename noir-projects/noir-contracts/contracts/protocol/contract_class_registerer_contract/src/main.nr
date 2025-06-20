mod events;

use dep::aztec::macros::aztec;

#[aztec]
pub contract ContractClassRegisterer {
    use dep::aztec::protocol_types::{
        abis::log_hash::LogHash,
        constants::{
            ARTIFACT_FUNCTION_TREE_MAX_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
            FUNCTION_TREE_HEIGHT, MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
            MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS,
            MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT,
        },
        contract_class_id::ContractClassId,
        hash::poseidon2_hash,
        utils::arrays::{array_concat, unsafe_padded_array_length},
    };

    use dep::aztec::{
        context::PrivateContext, hash::compute_public_bytecode_commitment,
        macros::functions::private, oracle::logs::notify_created_contract_class_log,
    };

    use crate::events::{
        class_registered::ContractClassRegistered,
        private_function_broadcasted::{
            ClassPrivateFunctionBroadcasted, InnerPrivateFunction, PrivateFunction,
        },
        utility_function_broadcasted::{
            ClassUtilityFunctionBroadcasted, InnerUtilityFunction, UtilityFunction,
        },
    };

    use dep::aztec::protocol_types::traits::ToField;

    // docs:start:import_capsules
    use dep::aztec::oracle::capsules;
    // docs:end:import_capsules

    #[private]
    fn register(
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field,
    ) {
        // TODO: We should be able to remove public_bytecode_commitment from the input if it's calculated in this function
        // docs:start:load_capsule
        let mut packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT,
            )
                .unwrap()
        };
        // docs:end:load_capsule
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

        // Emit the contract class id as a nullifier to be able to prove that this class has been (not) registered
        context.push_nullifier(contract_class_id.to_field());

        // Broadcast class info including public bytecode
        dep::aztec::oracle::debug_log::debug_log_format(
            "ContractClassRegistered: {}",
            [
                contract_class_id.to_field(),
                artifact_hash,
                private_functions_root,
                public_bytecode_commitment,
            ],
        );

        let event = ContractClassRegistered {
            contract_class_id,
            version: 1,
            artifact_hash,
            private_functions_root,
            packed_public_bytecode,
        };
        emit_contract_class_log(&mut context, event.serialize_non_standard());
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
        let private_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT,
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
        emit_contract_class_log(&mut context, event.serialize_non_standard());
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
        let utility_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS] = unsafe {
            capsules::load(
                context.this_address(),
                REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT,
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
        emit_contract_class_log(&mut context, event.serialize_non_standard());
    }

    #[contract_library_method]
    fn emit_contract_class_log<let N: u32>(context: &mut PrivateContext, log: [Field; N]) {
        let contract_address = context.this_address();
        let counter = context.next_counter();

        let log_to_emit: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] =
            array_concat(log, [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - N]);
        // Note: the length is not always N, it is the number of fields we want to broadcast, omitting trailing zeros to save blob space.
        // Safety: The below length is constrained in the base rollup, which will make sure that all the fields beyond length are zero.
        let length = unsafe { unsafe_padded_array_length(log_to_emit) };
        // We hash the entire padded log to ensure a user cannot pass a shorter length and so emit incorrect shorter bytecode.
        let log_hash = poseidon2_hash(log_to_emit);
        // Safety: the below only exists to broadcast the raw log, so we can provide it to the base rollup later to be constrained.
        unsafe {
            notify_created_contract_class_log(contract_address, log_to_emit, length, counter);
        }

        context.contract_class_logs_hashes.push(LogHash { value: log_hash, length }.count(counter));
    }

    #[private]
    fn assert_class_id_is_registered(contract_class_id: ContractClassId) {
        context.push_nullifier_read_request(contract_class_id.to_field());
    }
}
