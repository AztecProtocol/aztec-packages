use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
        tx_effect::TxEffect,
    },
    base::components::{
        archive::perform_archive_membership_check, constants::validate_combined_constant_data,
        PublicTubeDataValidator,
    },
    components::{append_tx_effects_for_blob, compute_kernel_out_hash},
};
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmProofData,
        combined_constant_data::CombinedConstantData,
        constant_rollup_data::ConstantRollupData,
        contract_class_log::{contract_class_log_array_merge, ContractClassLogData},
        side_effect::scoped::Scoped,
        sponge_blob::SpongeBlob,
        tube::PublicTubeData,
    },
    constants::{ARCHIVE_HEIGHT, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    hash::{silo_contract_class_log, silo_l2_to_l1_message},
    merkle_tree::MembershipWitness,
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::Hash,
    utils::arrays::array_merge,
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start_sponge_blob: SpongeBlob,

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    fn generate_tx_effect(
        self,
        reverted: bool,
        combined_constant_data: CombinedConstantData,
    ) -> (TxEffect, [u32; MAX_CONTRACT_CLASS_LOGS_PER_TX]) {
        let from_private = self.tube_data.public_inputs;
        let from_public = self.avm_proof_data.public_inputs;
        let revert_code = if reverted { 1 } else { 0 };
        let siloed_l2_to_l1_msgs = from_public.accumulated_data.l2_to_l1_msgs.map(
            |message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                message,
                combined_constant_data.tx_context.version,
                combined_constant_data.tx_context.chain_id,
            ),
        );

        let private_logs = if reverted {
            from_private.non_revertible_accumulated_data.private_logs
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.private_logs,
                from_private.revertible_accumulated_data.private_logs,
            )
        };
        let contract_class_logs = if reverted {
            from_private.non_revertible_accumulated_data.contract_class_logs
        } else {
            contract_class_log_array_merge(
                from_private.non_revertible_accumulated_data.contract_class_logs,
                from_private.revertible_accumulated_data.contract_class_logs,
            )
        };
        let siloed_contract_class_logs = contract_class_logs.map(
            |log: Scoped<ContractClassLogData>| silo_contract_class_log(log),
        );
        // These lengths have been constrained in the kernels to be correct.
        let contract_class_logs_lengths = contract_class_logs.map(|l| l.inner.log_size);

        (
            TxEffect {
                tx_hash: self.tube_data.public_inputs.hash(),
                revert_code,
                transaction_fee: from_public.transaction_fee,
                note_hashes: from_public.accumulated_data.note_hashes,
                nullifiers: from_public.accumulated_data.nullifiers,
                l2_to_l1_msgs: siloed_l2_to_l1_msgs,
                public_data_writes: from_public.accumulated_data.public_data_writes,
                private_logs,
                public_logs: from_public.accumulated_data.public_logs,
                contract_class_logs: siloed_contract_class_logs,
            }, contract_class_logs_lengths,
        )
    }

    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        let tube_data_validator = PublicTubeDataValidator::new(self.tube_data);
        tube_data_validator.verify_proof();
        tube_data_validator.validate_with_rollup_data(self.constants);

        // Warning: Fake verification! TODO(#8470)
        // if !dep::std::runtime::is_unconstrained() {
        //    self.avm_proof_data.fake_verify();
        // }

        // TODO(#8470)
        // if !dep::std::runtime::is_unconstrained() {
        //     self.avm_proof_data.verify();
        //     self.avm_proof_data.vk_data.validate_in_vk_tree([AVM_VK_INDEX]);
        // }
        // TODO: Validate tube_data.public_inputs vs avm_proof_data.public_inputs
        let reverted = self.avm_proof_data.public_inputs.reverted;

        let combined_constant_data = CombinedConstantData::combine(
            self.tube_data.public_inputs.constants,
            self.avm_proof_data.public_inputs.global_variables,
        );
        validate_combined_constant_data(combined_constant_data, self.constants);

        let rollup_validation_requests = self.tube_data.public_inputs.rollup_validation_requests;

        // Verify the max block number
        // TODO #5345: why is block_number a Field and not u32?
        if rollup_validation_requests.max_block_number.is_some() {
            assert(
                self.constants.global_variables.block_number as u32
                    <= rollup_validation_requests.max_block_number.unwrap_unchecked(),
                "kernel max_block_number is smaller than block number",
            );
        }

        let (tx_effect, contract_class_logs_lengths) =
            self.generate_tx_effect(reverted, combined_constant_data);

        let out_hash = compute_kernel_out_hash(tx_effect.l2_to_l1_msgs);

        let end_sponge_blob = append_tx_effects_for_blob(
            tx_effect,
            self.start_sponge_blob,
            contract_class_logs_lengths,
        );

        // Perform membership checks that the notes provided exist within the historical trees data
        perform_archive_membership_check(
            self.constants.last_archive.root,
            self.archive_root_membership_witness,
            combined_constant_data.historical_header,
        );

        BaseOrMergeRollupPublicInputs {
            rollup_type: BASE_ROLLUP_TYPE,
            num_txs: 1,
            constants: self.constants,
            start: self
                .avm_proof_data
                .public_inputs
                .start_tree_snapshots
                .to_partial_state_reference(),
            end: self.avm_proof_data.public_inputs.end_tree_snapshots.to_partial_state_reference(),
            start_sponge_blob: self.start_sponge_blob,
            end_sponge_blob,
            out_hash,
            accumulated_fees: self.avm_proof_data.public_inputs.transaction_fee,
            accumulated_mana_used: self.avm_proof_data.public_inputs.end_gas_used.l2_gas as Field,
        }
    }
}

mod tests {
    use crate::{
        abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
        base::public_base_rollup::PublicBaseRollupInputs,
        components::{
            append_tx_effects_for_blob, encode_blob_prefix, TX_EFFECTS_BLOB_HASH_INPUT_FIELDS,
        },
    };
    use crate::abis::tx_effect::TxEffect;
    use dep::types::{
        abis::{
            append_only_tree_snapshot::AppendOnlyTreeSnapshot,
            constant_rollup_data::ConstantRollupData,
            nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
            side_effect::OrderedValue, sponge_blob::SpongeBlob, tree_snapshots::TreeSnapshots,
        },
        address::EthAddress,
        constants::{
            ARCHIVE_HEIGHT, AVM_VK_INDEX, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
            CONTRACT_CLASS_LOGS_PREFIX, L2_L1_MSGS_PREFIX, MAX_CONTRACT_CLASS_LOGS_PER_TX,
            MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
            MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTES_PREFIX, NULLIFIERS_PREFIX,
            PRIVATE_LOG_SIZE_IN_FIELDS, PRIVATE_LOGS_PREFIX, PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
            PUBLIC_LOG_SIZE_IN_FIELDS, PUBLIC_LOGS_PREFIX, REVERT_CODE_PREFIX, TUBE_VK_INDEX,
            TX_FEE_PREFIX, TX_START_PREFIX,
        },
        data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
        hash::silo_l2_to_l1_message,
        merkle_tree::MembershipWitness,
        messaging::l2_to_l1_message::ScopedL2ToL1Message,
        tests::{
            fixture_builder::FixtureBuilder,
            fixtures::{self, merkle_tree::generate_full_sha_tree},
            merkle_tree_utils::NonEmptyMerkleTree,
        },
        traits::{Empty, Hash, Serialize},
        utils::{arrays::array_concat, field::field_from_bytes},
    };
    use types::hash::silo_contract_class_log;

    struct NullifierInsertion {
        existing_index: u32,
        value: Field,
    }

    global MAX_NULLIFIERS_PER_TEST: u32 = 4;
    global AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST: u32 = 128;
    global PRE_EXISTING_PUBLIC_DATA_LEAVES: u32 = 10;
    struct PublicBaseRollupInputsBuilder {
        tube_data: FixtureBuilder,
        avm_data: FixtureBuilder,
        reverted: bool,
        transaction_fee: Field,
        pre_existing_notes: [Field; MAX_NOTE_HASHES_PER_TX],
        pre_existing_nullifiers: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
        pre_existing_contracts: [Field; 2],
        pre_existing_public_data: [PublicDataTreeLeafPreimage; PRE_EXISTING_PUBLIC_DATA_LEAVES],
        pre_existing_blocks: [Field; 2],
        public_data_writes: BoundedVec<(u32, PublicDataTreeLeaf), MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
        nullifiers: BoundedVec<NullifierInsertion, MAX_NULLIFIERS_PER_TEST>,
        constants: ConstantRollupData,
    }

    impl PublicBaseRollupInputsBuilder {
        fn new() -> Self {
            let mut inputs = PublicBaseRollupInputsBuilder::empty();
            inputs.tube_data = FixtureBuilder::new().in_vk_tree(TUBE_VK_INDEX);
            inputs.avm_data = FixtureBuilder::new().in_vk_tree(AVM_VK_INDEX);

            inputs.constants.global_variables.chain_id = fixtures::CHAIN_ID;
            inputs.constants.global_variables.version = fixtures::VERSION;
            inputs.avm_data.global_variables = inputs.constants.global_variables;
            inputs.constants.vk_tree_root = inputs.tube_data.vk_tree_root;
            inputs.constants.protocol_contract_tree_root =
                inputs.tube_data.protocol_contract_tree_root;

            inputs.pre_existing_blocks[0] = inputs.tube_data.historical_header.hash();

            inputs
        }

        unconstrained fn new_with_previous_kernel(previous_vk_index: u32) -> Self {
            let mut builder = PublicBaseRollupInputsBuilder::new();
            builder.tube_data = builder.tube_data.in_vk_tree(previous_vk_index);
            builder
        }

        fn build_pre_existing_tx_effects(self) -> TxEffect {
            let mut res = TxEffect::empty();
            res.note_hashes = self.pre_existing_notes;
            res.nullifiers = self.pre_existing_nullifiers.map(|nullifier: NullifierLeafPreimage| {
                nullifier.nullifier
            });
            let all_public_data_update_requests = self.pre_existing_public_data.map(
                |leaf_preimage: PublicDataTreeLeafPreimage| {
                    PublicDataWrite { leaf_slot: leaf_preimage.slot, value: leaf_preimage.value }
                },
            );
            res.public_data_writes = array_concat(
                all_public_data_update_requests,
                [
                    PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
                        - PRE_EXISTING_PUBLIC_DATA_LEAVES
                ],
            );

            res
        }

        fn extract_subtree_sibling_path<let FULL_HEIGHT: u32, let SIBLING_PATH_LENGTH: u32>(
            path: [Field; FULL_HEIGHT],
            mut sibling_path: [Field; SIBLING_PATH_LENGTH],
        ) -> [Field; SIBLING_PATH_LENGTH] {
            let subtree_height = FULL_HEIGHT - SIBLING_PATH_LENGTH;
            for i in subtree_height..FULL_HEIGHT {
                sibling_path[i - subtree_height] = path[i];
            }
            sibling_path
        }

        unconstrained fn build_inputs(mut self) -> PublicBaseRollupInputs {
            let mut tube_data = self.tube_data.to_public_tube_data();
            let mut avm_proof_data = self.avm_data.to_avm_proof_data(self.reverted);

            avm_proof_data.public_inputs.transaction_fee = self.transaction_fee;

            let mut pre_existing_leaves = [0; AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST];

            for i in 0..self.pre_existing_public_data.len() {
                pre_existing_leaves[i] = self.pre_existing_public_data[i].hash();
            }

            let start_archive = NonEmptyMerkleTree::new(
                self.pre_existing_blocks,
                [0; ARCHIVE_HEIGHT],
                [0; ARCHIVE_HEIGHT - 1],
                [0; 1],
            );
            self.constants.last_archive = AppendOnlyTreeSnapshot {
                root: start_archive.get_root(),
                next_available_leaf_index: start_archive.get_next_available_index() as u32,
            };

            for i in 0..self.nullifiers.len() {
                let nullifier = self.nullifiers.get_unchecked(i);
                avm_proof_data.public_inputs.accumulated_data.nullifiers[i] = nullifier.value;
            }

            for i in 0..self.public_data_writes.len() {
                let leaf = self.public_data_writes.get_unchecked(i).1;
                avm_proof_data.public_inputs.accumulated_data.public_data_writes[i] =
                    PublicDataWrite { leaf_slot: leaf.slot, value: leaf.value };
            }

            let tx_effect = self.build_pre_existing_tx_effects();

            let start_sponge_blob = append_tx_effects_for_blob(
                tx_effect,
                SpongeBlob::new(TX_EFFECTS_BLOB_HASH_INPUT_FIELDS),
                [0; MAX_CONTRACT_CLASS_LOGS_PER_TX],
            );

            PublicBaseRollupInputs {
                tube_data,
                avm_proof_data,
                start_sponge_blob,
                archive_root_membership_witness: MembershipWitness {
                    leaf_index: 0,
                    sibling_path: start_archive.get_sibling_path(0),
                },
                constants: self.constants,
            }
        }

        fn execute(self) -> BaseOrMergeRollupPublicInputs {
            /// Safety: This is a mock for testing only
            let inputs = unsafe { self.build_inputs() };
            inputs.execute()
        }

        fn succeeds(self) {
            let _ = self.execute();
        }

        fn fails(self) {
            let _ = self.execute();
        }
    }

    impl Empty for PublicBaseRollupInputsBuilder {
        fn empty() -> Self {
            Self {
                tube_data: FixtureBuilder::empty(),
                avm_data: FixtureBuilder::empty(),
                transaction_fee: 0,
                reverted: false,
                pre_existing_notes: [0; MAX_NOTE_HASHES_PER_TX],
                pre_existing_nullifiers: [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX],
                pre_existing_contracts: [0; 2],
                pre_existing_public_data: [
                    PublicDataTreeLeafPreimage::empty(); PRE_EXISTING_PUBLIC_DATA_LEAVES
                ],
                pre_existing_blocks: [0; 2],
                public_data_writes: BoundedVec::new(),
                nullifiers: BoundedVec::new(),
                constants: ConstantRollupData::empty(),
            }
        }
    }

    #[test]
    unconstrained fn empty_tx_effects_sponge() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();
        let mut expected_sponge = outputs.start_sponge_blob;
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    #[test]
    unconstrained fn non_empty_tx_effects_sponge() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.avm_data.append_note_hashes(50);
        let inputs = builder.build_inputs();
        let outputs = inputs.execute();
        let mut tx_effects = [0; 54];
        // Initial field = TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
        // The first 4 are: i=0 init field, i=1: tx hash, i=2: tx fee, i=3: note prefix
        tx_effects[0] = field_from_bytes(
            array_concat(
                TX_START_PREFIX.to_be_bytes::<8>(),
                [0, 0, tx_effects.len() as u8, 0, REVERT_CODE_PREFIX, 0, 0],
            ),
            true,
        );
        // TX hash
        tx_effects[1] = inputs.tube_data.public_inputs.hash();
        tx_effects[2] = field_from_bytes(
            array_concat([TX_FEE_PREFIX, 0], (0).to_be_bytes::<29>()),
            true,
        );
        tx_effects[3] = encode_blob_prefix(NOTES_PREFIX, 50);
        for i in 0..50 {
            tx_effects[i + 4] = builder.avm_data.note_hashes.storage()[i].value();
        }
        let mut expected_sponge = outputs.start_sponge_blob;

        expected_sponge.absorb(tx_effects, tx_effects.len());
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    #[test]
    unconstrained fn fuller_tx_effects_sponge() {
        let NUM_NOTES = 50;
        let NUM_NULLIFIERS = 3;
        let NUM_MSGS = 5;
        let NUM_PRIV_EVENT_LOGS = 4;
        let NUM_PUB_LOGS = 6;
        let NUM_CC_LOGS = 1;
        // Below will only work with NUM_CC_LOGS=1
        let cc_log = [1, 2, 3];
        let PUB_DATA_SLOT = 25;
        let PUB_DATA_VALUE = 60;
        let TOTAL_BLOB_FIELDS = 3 // revert code, tx hash and tx fee
            + NUM_NOTES
            + 1 // notes and prefix
            + NUM_NULLIFIERS
            + 1 // nullifiers and prefix
            + NUM_MSGS
            + 1 // L2 to L1 msgs and prefix
            + NUM_PUB_LOGS * PUBLIC_LOG_SIZE_IN_FIELDS
            + 1 // public logs and prefix
            + NUM_CC_LOGS * (cc_log.len() + 1)
            + 1 // contract class logs and prefix
            + 2
            + 1 // single public data update (2 fields) and prefix
            + NUM_PRIV_EVENT_LOGS * PRIVATE_LOG_SIZE_IN_FIELDS
            + 1; // private logs and prefix
        let tx_fee = 100_000;
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.transaction_fee = tx_fee;
        builder.avm_data.append_note_hashes(NUM_NOTES);
        // Copied from nullifier tests above:
        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };
        for i in 0..NUM_NULLIFIERS {
            builder.nullifiers.push(
                NullifierInsertion { existing_index: 1, value: (8 + i) as Field },
            );
        }
        builder.avm_data.append_l2_to_l1_msgs(NUM_MSGS);
        // Copied from public data test below:
        builder.pre_existing_public_data[0] =
            PublicDataTreeLeafPreimage { slot: 20, value: 40, next_slot: 0, next_index: 0 };
        builder.public_data_writes.push((
            0, PublicDataTreeLeaf { slot: PUB_DATA_SLOT, value: PUB_DATA_VALUE },
        ));
        builder.tube_data.append_private_logs(NUM_PRIV_EVENT_LOGS);
        builder.avm_data.append_public_logs(NUM_PUB_LOGS);
        // Below will only work with NUM_CC_LOGS=1
        builder.tube_data.add_contract_class_log(cc_log);
        let inputs = builder.build_inputs();
        let outputs = inputs.execute();

        let mut reconstructed_tx_effects = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];
        // Initial field = TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
        // revert code = 0
        let total_blob_fields_bytes = (TOTAL_BLOB_FIELDS as Field).to_be_bytes::<2>();
        reconstructed_tx_effects[0] = field_from_bytes(
            array_concat(
                TX_START_PREFIX.to_be_bytes::<8>(),
                [
                    0,
                    total_blob_fields_bytes[0],
                    total_blob_fields_bytes[1],
                    0,
                    REVERT_CODE_PREFIX,
                    0,
                    0,
                ],
            ),
            true,
        );
        // tx hash
        reconstructed_tx_effects[1] = inputs.tube_data.public_inputs.hash();
        // tx fee
        reconstructed_tx_effects[2] = field_from_bytes(
            array_concat([TX_FEE_PREFIX, 0], tx_fee.to_be_bytes::<29>()),
            true,
        );
        // notes
        let mut offset = 3;
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, NUM_NOTES);
        reconstructed_tx_effects[offset] = notes_prefix;
        offset += 1;
        for i in 0..NUM_NOTES {
            reconstructed_tx_effects[offset + i] =
                builder.avm_data.note_hashes.storage()[i].value();
        }
        offset += NUM_NOTES;
        // nullifiers
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, NUM_NULLIFIERS);
        reconstructed_tx_effects[offset] = nullifiers_prefix;
        offset += 1;
        for i in 0..NUM_NULLIFIERS {
            reconstructed_tx_effects[offset + i] = builder.nullifiers.storage()[i].value;
        }
        offset += NUM_NULLIFIERS;
        // l2 to l1 msgs
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, NUM_MSGS);
        reconstructed_tx_effects[offset] = l2_to_l1_msgs_prefix;
        offset += 1;
        for i in 0..NUM_MSGS {
            reconstructed_tx_effects[offset + i] = silo_l2_to_l1_message(
                builder.avm_data.l2_to_l1_msgs.storage()[i],
                builder.avm_data.tx_context.version,
                builder.avm_data.tx_context.chain_id,
            );
        }
        offset += NUM_MSGS;
        // public data update
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, 2);
        reconstructed_tx_effects[offset] = public_data_update_requests_prefix;
        offset += 1;
        reconstructed_tx_effects[offset] = PUB_DATA_SLOT;
        reconstructed_tx_effects[offset + 1] = PUB_DATA_VALUE;
        offset += 2;
        // private logs
        let total_private_logs_len = NUM_PRIV_EVENT_LOGS * PRIVATE_LOG_SIZE_IN_FIELDS;
        let private_logs_prefix = encode_blob_prefix(PRIVATE_LOGS_PREFIX, total_private_logs_len);
        reconstructed_tx_effects[offset] = private_logs_prefix;
        offset += 1;
        for i in 0..NUM_PRIV_EVENT_LOGS {
            for j in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
                reconstructed_tx_effects[offset + i * PRIVATE_LOG_SIZE_IN_FIELDS + j] =
                    builder.tube_data.private_logs.storage()[i].inner.log.fields[j];
            }
        }
        offset += total_private_logs_len;
        // public logs
        let public_logs_prefix =
            encode_blob_prefix(PUBLIC_LOGS_PREFIX, NUM_PUB_LOGS * PUBLIC_LOG_SIZE_IN_FIELDS);
        reconstructed_tx_effects[offset] = public_logs_prefix;
        offset += 1;
        for i in 0..NUM_PUB_LOGS {
            let log = builder.avm_data.public_logs.storage()[i].serialize();
            for j in 0..PUBLIC_LOG_SIZE_IN_FIELDS {
                reconstructed_tx_effects[offset + i * PUBLIC_LOG_SIZE_IN_FIELDS + j] = log[j];
            }
        }
        offset += NUM_PUB_LOGS * PUBLIC_LOG_SIZE_IN_FIELDS;
        // cc logs
        let total_contract_class_logs_len = NUM_CC_LOGS * (cc_log.len() + 1);
        let contract_class_logs_prefix =
            encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, total_contract_class_logs_len);
        reconstructed_tx_effects[offset] = contract_class_logs_prefix;
        offset += 1;
        for i in 0..NUM_CC_LOGS {
            let siloed_log =
                silo_contract_class_log(builder.tube_data.contract_class_logs.storage()[i]);
            let log_len = builder.tube_data.contract_class_logs.storage()[i].inner.log_size;
            if log_len != 0 {
                reconstructed_tx_effects[offset] = log_len as Field;
                offset += 1;
            }
            for j in 0..CONTRACT_CLASS_LOG_SIZE_IN_FIELDS {
                if j < log_len {
                    reconstructed_tx_effects[offset] = siloed_log.fields[j];
                    offset += 1;
                }
            }
        }

        // Sanity check
        assert(offset == TOTAL_BLOB_FIELDS);

        let mut expected_sponge = outputs.start_sponge_blob;
        expected_sponge.absorb(reconstructed_tx_effects, offset);
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    #[test]
    unconstrained fn empty_block_out_hash() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();
        assert_eq(outputs.out_hash, 0);
    }

    #[test]
    unconstrained fn nonempty_block_out_hash() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            builder.avm_data.add_exposed_l2_to_l1_message(
                i as Field,
                EthAddress::from_field(1 + i as Field),
            );
        }

        let out_hash = builder.execute().out_hash;
        let siloed_l2_to_l1_msgs = builder.avm_data.l2_to_l1_msgs.map(
            |l2_to_l1_message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                l2_to_l1_message,
                builder.constants.global_variables.version,
                builder.constants.global_variables.chain_id,
            ),
        );

        // Since we fill the tree completely, we know to expect a full tree as below
        let expected_tree = generate_full_sha_tree(siloed_l2_to_l1_msgs.storage());
        assert_eq(out_hash, expected_tree.get_root());
    }

    #[test(should_fail_with = "membership check failed")]
    unconstrained fn compute_membership_archive_negative() {
        let mut inputs = PublicBaseRollupInputsBuilder::new().build_inputs();
        inputs.archive_root_membership_witness.sibling_path[0] = 27;
        let _output = inputs.execute();
    }

    #[test]
    unconstrained fn constants_dont_change() {
        let inputs = PublicBaseRollupInputsBuilder::new().build_inputs();
        let outputs = inputs.execute();

        assert(inputs.constants.eq(outputs.constants));
    }

    #[test(should_fail_with = "kernel chain_id does not match the rollup chain_id")]
    unconstrained fn constants_dont_match_kernels_chain_id() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.chain_id = 3;
        builder.fails();
    }

    #[test(should_fail_with = "kernel version does not match the rollup version")]
    unconstrained fn constants_dont_match_kernels_version() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.version += 1;
        builder.fails();
    }

    #[test(should_fail_with = "kernel global variables do not match the rollup global variables")]
    unconstrained fn constants_global_variables_dont_match_kernels() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.avm_data.global_variables.block_number = 6;
        builder.constants.global_variables.block_number = 7;
        builder.fails();
    }

    #[test(should_fail_with = "kernel max_block_number is smaller than block number")]
    unconstrained fn constants_dont_satisfy_smaller_max_block_number() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.block_number = 42;
        builder.avm_data.global_variables.block_number = 42;
        builder.tube_data.set_max_block_number(5);
        builder.fails();
    }

    #[test]
    unconstrained fn constants_satisfy_equal_max_block_number() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.block_number = 42;
        builder.avm_data.global_variables.block_number = 42;
        builder.tube_data.set_max_block_number(42);
        builder.succeeds();
    }

    #[test]
    unconstrained fn constants_satisfy_larger_max_block_number() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.block_number = 42;
        builder.avm_data.global_variables.block_number = 42;
        builder.tube_data.set_max_block_number(4294967295);
        builder.succeeds();
    }

    #[test]
    unconstrained fn num_txs_is_1() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();

        assert_eq(outputs.num_txs, 1);
    }

    #[test]
    unconstrained fn passes_state_roots_from_avm() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        let start_snapshot = TreeSnapshots {
            note_hash_tree: AppendOnlyTreeSnapshot { root: 1, next_available_leaf_index: 2 },
            nullifier_tree: AppendOnlyTreeSnapshot { root: 3, next_available_leaf_index: 4 },
            public_data_tree: AppendOnlyTreeSnapshot { root: 5, next_available_leaf_index: 6 },
            l1_to_l2_message_tree: AppendOnlyTreeSnapshot::zero(),
        };
        let end_snapshot = TreeSnapshots {
            note_hash_tree: AppendOnlyTreeSnapshot { root: 7, next_available_leaf_index: 8 },
            nullifier_tree: AppendOnlyTreeSnapshot { root: 9, next_available_leaf_index: 10 },
            public_data_tree: AppendOnlyTreeSnapshot { root: 11, next_available_leaf_index: 12 },
            l1_to_l2_message_tree: AppendOnlyTreeSnapshot::zero(),
        };

        builder.avm_data.start_snapshots = start_snapshot;
        builder.avm_data.end_snapshots = end_snapshot;
        let outputs = builder.execute();

        assert_eq(outputs.start, start_snapshot.to_partial_state_reference());
        assert_eq(outputs.end, end_snapshot.to_partial_state_reference());
    }

}
