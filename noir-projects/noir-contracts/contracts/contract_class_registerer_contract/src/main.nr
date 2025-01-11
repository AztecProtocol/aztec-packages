mod events;
mod capsule;

use dep::aztec::macros::aztec;

#[aztec]
contract ContractClassRegisterer {
    use dep::aztec::protocol_types::{
        abis::log_hash::LogHash,
        constants::{
            ARTIFACT_FUNCTION_TREE_MAX_HEIGHT, FUNCTION_TREE_HEIGHT,
            MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
            MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS,
            MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
        },
        contract_class_id::ContractClassId,
    };

    use dep::aztec::{
        context::PrivateContext, macros::functions::private,
        oracle::logs::emit_contract_class_unencrypted_log_private,
    };

    use crate::events::{
        class_registered::ContractClassRegistered,
        private_function_broadcasted::{
            ClassPrivateFunctionBroadcasted, InnerPrivateFunction, PrivateFunction,
        },
        unconstrained_function_broadcasted::{
            ClassUnconstrainedFunctionBroadcasted, InnerUnconstrainedFunction,
            UnconstrainedFunction,
        },
    };

    // docs:start:import_pop_capsule
    use crate::capsule::pop_capsule;

    // docs:end:import_pop_capsule

    #[private]
    fn register(
        artifact_hash: Field,
        private_functions_root: Field,
        public_bytecode_commitment: Field,
        emit: bool,
    ) {
        // TODO: Validate public_bytecode_commitment is the correct commitment of packed_public_bytecode
        // TODO: We should be able to remove public_bytecode_commitment from the input if it's calculated in this function
        // docs:start:pop_capsule
        let packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] =
            unsafe { pop_capsule() };
        // docs:end:pop_capsule
        // First field element contains the length of the bytecode
        let bytecode_length_in_bytes: u32 = packed_public_bytecode[0] as u32;
        let bytecode_length_in_fields: u32 =
            (bytecode_length_in_bytes / 31) + (bytecode_length_in_bytes % 31 != 0) as u32;
        assert(bytecode_length_in_fields < MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);

        let mut computed_public_bytecode_commitment = 0;
        // We can hash up to MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1, since the first element is the length
        for i in 0..(MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) {
            // While we are forced to run the hash MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS times in the circuit,
            // we want the bytecode commitment to be based on the actual length
            if (i < bytecode_length_in_fields) {
                // We skip the first element when hashing since it is the length
                computed_public_bytecode_commitment = std::hash::poseidon2::Poseidon2::hash(
                    [packed_public_bytecode[i + 1], computed_public_bytecode_commitment],
                    2,
                );
            } else {
                // Any bytes after the bytecode length must be 0
                assert_eq(packed_public_bytecode[i + 1], 0);
            }
        }
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

        // TODO(#10007): Drop this conditional and always emit the bytecode. We allow skipping the broadcast
        // as a stopgap solution to allow txs to fit in Sepolia when we broadcast public bytecode.
        if emit {
            let event = ContractClassRegistered {
                contract_class_id,
                version: 1,
                artifact_hash,
                private_functions_root,
                packed_public_bytecode,
            };
            emit_contract_class_log(&mut context, event.serialize());
        }
    }

    #[private]
    fn broadcast_private_function(
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        unconstrained_functions_artifact_tree_root: Field,
        private_function_tree_sibling_path: [Field; FUNCTION_TREE_HEIGHT],
        private_function_tree_leaf_index: Field,
        artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerPrivateFunction,
    ) {
        let private_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS] =
            unsafe { pop_capsule() };

        let event = ClassPrivateFunctionBroadcasted {
            contract_class_id,
            artifact_metadata_hash,
            unconstrained_functions_artifact_tree_root,
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
                unconstrained_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.vk_hash,
                function_data.metadata_hash,
            ],
        );
        emit_contract_class_log(&mut context, event.serialize());
    }

    #[private]
    fn broadcast_unconstrained_function(
        contract_class_id: ContractClassId,
        artifact_metadata_hash: Field,
        private_functions_artifact_tree_root: Field,
        artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
        artifact_function_tree_leaf_index: Field,
        function_data: InnerUnconstrainedFunction,
    ) {
        let unconstrained_bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS] =
            unsafe { pop_capsule() };
        let event = ClassUnconstrainedFunctionBroadcasted {
            contract_class_id,
            artifact_metadata_hash,
            private_functions_artifact_tree_root,
            artifact_function_tree_sibling_path,
            artifact_function_tree_leaf_index,
            function: UnconstrainedFunction {
                selector: function_data.selector,
                metadata_hash: function_data.metadata_hash,
                bytecode: unconstrained_bytecode,
            },
        };
        dep::aztec::oracle::debug_log::debug_log_format(
            "ClassUnconstrainedFunctionBroadcasted: {}",
            [
                contract_class_id.to_field(),
                artifact_metadata_hash,
                private_functions_artifact_tree_root,
                function_data.selector.to_field(),
                function_data.metadata_hash,
            ],
        );
        emit_contract_class_log(&mut context, event.serialize());
    }

    #[contract_library_method]
    fn emit_contract_class_log<let N: u32>(context: &mut PrivateContext, log: [Field; N]) {
        let contract_address = context.this_address();
        let counter = context.next_counter();

        // The log preimage is too large for the hash to compile (16,200 fields, 518,400 bytes), so we do this via a
        // specialized oracle.
        // A malicious oracle cannot force us to use an incorrect bytecode:
        // - Contract class -> we will commit to the packed bytecode (currently a TODO)
        // - Private function -> we provide a membership proof
        // - Unconstrained function -> we provide a membership proof
        // However, the sequencer will be required to know a contract's preimage if it is called and the sequencer
        // cannot prove non-registration. Therefore, it is possible that a malicious oracle might prevent sequencers
        // from including transactions with calls to certain badly-broadcasted contracts.
        // TODO(#8978): review correctness
        let log_hash =
            unsafe { emit_contract_class_unencrypted_log_private(contract_address, log, counter) };

        // 40 = addr (32) + raw log len (4) + processed log len (4)
        context.contract_class_logs_hashes.push(
            LogHash { value: log_hash, counter, length: 40 + (N as Field) * 32 },
        );
    }

    #[private]
    fn assert_class_id_is_registered(contract_class_id: ContractClassId) {
        context.push_nullifier_read_request(contract_class_id.to_field());
    }
}
