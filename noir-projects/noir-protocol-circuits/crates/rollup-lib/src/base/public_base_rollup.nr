use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
        tx_effect::TxEffect,
    },
    base::components::{
        archive::perform_archive_membership_check, constants::validate_combined_constant_data,
        PublicTubeDataValidator,
    },
    components::{append_tx_effects_for_blob, compute_kernel_out_hash, validate_contract_class_log},
};
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmProofData, combined_constant_data::CombinedConstantData,
        constant_rollup_data::ConstantRollupData, contract_class_log::ContractClassLog, log::Log,
        sponge_blob::SpongeBlob, tube::PublicTubeData,
    },
    constants::{ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    hash::silo_l2_to_l1_message,
    merkle_tree::MembershipWitness,
    proof::traits::Verifiable,
    traits::{Empty, Hash},
    utils::arrays::array_merge,
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start_sponge_blob: SpongeBlob,

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    fn generate_tx_effect(self, combined_constant_data: CombinedConstantData) -> TxEffect {
        let from_private = self.tube_data.public_inputs;
        let from_public = self.avm_proof_data.public_inputs;
        let reverted = from_public.reverted;
        let revert_code = if reverted { 1 } else { 0 };
        let siloed_l2_to_l1_msgs = from_public.accumulated_data.l2_to_l1_msgs.map(|message| silo_l2_to_l1_message(
            message,
            combined_constant_data.tx_context.version,
            combined_constant_data.tx_context.chain_id,
        ));

        let private_logs = if reverted {
            from_private.non_revertible_accumulated_data.private_logs
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.private_logs,
                from_private.revertible_accumulated_data.private_logs,
            )
        };
        let contract_class_logs_hashes = if reverted {
            from_private.non_revertible_accumulated_data.contract_class_logs_hashes
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.contract_class_logs_hashes,
                from_private.revertible_accumulated_data.contract_class_logs_hashes,
            )
        };

        let mut contract_class_logs = [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX];
        for i in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            let log_hash = contract_class_logs_hashes[i];
            let log_fields = self.contract_class_log_fields[i];
            validate_contract_class_log(log_hash, log_fields);

            contract_class_logs[i] = ContractClassLog {
                log: Log::new(log_fields, log_hash.inner.length),
                contract_address: log_hash.contract_address,
            };
        }

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
            contract_class_logs,
        }
    }

    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        let tube_data_validator = PublicTubeDataValidator::new(self.tube_data);
        tube_data_validator.validate_proof();
        tube_data_validator.validate_with_rollup_data(self.constants);
        tube_data_validator.validate_with_avm_data(self.avm_proof_data.public_inputs);

        // TODO(#8470)
        if !dep::std::runtime::is_unconstrained() {
            self.avm_proof_data.verify();
            //     self.avm_proof_data.vk_data.validate_in_vk_tree([AVM_VK_INDEX]);
        }

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

        let tx_effect = self.generate_tx_effect(combined_constant_data);

        let out_hash = compute_kernel_out_hash(tx_effect.l2_to_l1_msgs);

        let end_sponge_blob = append_tx_effects_for_blob(tx_effect, self.start_sponge_blob);

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
        hash::{compute_contract_class_log_hash, silo_l2_to_l1_message},
        merkle_tree::MembershipWitness,
        tests::{
            fixture_builder::FixtureBuilder,
            fixtures::{self, merkle_tree::generate_full_sha_tree},
            merkle_tree_utils::NonEmptyMerkleTree,
        },
        traits::{Empty, Hash, ToField},
        utils::{arrays::array_concat, field::field_from_bytes},
    };
    use types::abis::gas::Gas;
    use types::abis::gas_fees::GasFees;
    use types::abis::gas_settings::GasSettings;
    use types::constants::MAX_L2_GAS_PER_TX_PUBLIC_PORTION;

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
        transaction_fee: Field,
        pre_existing_notes: [Field; MAX_NOTE_HASHES_PER_TX],
        pre_existing_nullifiers: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
        pre_existing_contracts: [Field; 2],
        pre_existing_public_data: [PublicDataTreeLeafPreimage; PRE_EXISTING_PUBLIC_DATA_LEAVES],
        pre_existing_blocks: [Field; 2],
        public_data_writes: BoundedVec<(u32, PublicDataTreeLeaf), MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
        nullifiers: BoundedVec<NullifierInsertion, MAX_NULLIFIERS_PER_TEST>,
        constants: ConstantRollupData,
        contract_class_log_fields: BoundedVec<[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS], MAX_CONTRACT_CLASS_LOGS_PER_TX>,
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
            let all_public_data_update_requests = self
                .pre_existing_public_data
                .map(|leaf_preimage: PublicDataTreeLeafPreimage| {
                    PublicDataWrite { leaf_slot: leaf_preimage.slot, value: leaf_preimage.value }
                });
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

        // Exists separately to allow us to append correct log preimages and hashes
        unconstrained fn append_contract_class_log<let N: u32>(&mut self, log_fields: [Field; N]) {
            let padded_log_fields: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] =
                array_concat(log_fields, [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - N]);
            self.contract_class_log_fields.push(padded_log_fields);

            let log_hash = compute_contract_class_log_hash(padded_log_fields);
            self.tube_data.add_contract_class_log_hash(log_hash, N);
        }

        unconstrained fn build_inputs(mut self) -> PublicBaseRollupInputs {
            let mut tube_data = self.tube_data.to_public_tube_data();
            let mut avm_proof_data = self.avm_data.to_avm_proof_data();

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
                contract_class_log_fields: self.contract_class_log_fields.storage(),
            }
        }

        fn execute(self) -> BaseOrMergeRollupPublicInputs {
            // Safety: This is a mock for testing only
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
                contract_class_log_fields: BoundedVec::new(),
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

        builder.tube_data.append_note_hashes(50);
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
        let private_log_lengths = [7, 2, 9];
        let NUM_PRIVATE_LOGS = private_log_lengths.len();
        let pub_log_lengths = [3, 2, 7, 1];
        let NUM_PUBLIC_LOGS = pub_log_lengths.len();
        let cc_log_0 = [58, 79, 14];
        let cc_log_lengths = [cc_log_0.len()];
        let NUM_CC_LOGS = cc_log_lengths.len();
        let PUB_DATA_SLOT = 25;
        let PUB_DATA_VALUE = 60;
        let tx_fee = 100_000;
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.transaction_fee = tx_fee;

        builder.tube_data.append_note_hashes(NUM_NOTES);
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
        builder.tube_data.append_l2_to_l1_msgs(NUM_MSGS);
        builder.avm_data.append_l2_to_l1_msgs(NUM_MSGS);
        // Copied from public data test below:
        builder.pre_existing_public_data[0] =
            PublicDataTreeLeafPreimage { slot: 20, value: 40, next_slot: 0, next_index: 0 };
        builder.public_data_writes.push((
            0, PublicDataTreeLeaf { slot: PUB_DATA_SLOT, value: PUB_DATA_VALUE },
        ));
        builder.tube_data.append_private_logs_with_lengths(private_log_lengths);
        builder.avm_data.append_public_logs_with_lengths(pub_log_lengths);
        builder.append_contract_class_log(cc_log_0);
        let inputs = builder.build_inputs();
        let outputs = inputs.execute();

        let mut reconstructed_tx_effects = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];
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
                builder.avm_data.l2_to_l1_msgs.get(i).expose_to_public(),
                builder.avm_data.tx_context.version,
                builder.avm_data.tx_context.chain_id,
            );
        }
        offset += NUM_MSGS;
        // public data update
        // 1 public data write is added for paying the fee.
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, 1);
        reconstructed_tx_effects[offset] = public_data_update_requests_prefix;
        offset += 1;
        reconstructed_tx_effects[offset] = PUB_DATA_SLOT;
        reconstructed_tx_effects[offset + 1] = PUB_DATA_VALUE;
        offset += 2;
        // private logs
        let private_logs_prefix = encode_blob_prefix(PRIVATE_LOGS_PREFIX, NUM_PRIVATE_LOGS);
        reconstructed_tx_effects[offset] = private_logs_prefix;
        offset += 1;
        for i in 0..NUM_PRIVATE_LOGS {
            let log_len = private_log_lengths[i];
            let log_fields = builder.tube_data.private_logs.get(i).inner.log.fields;
            reconstructed_tx_effects[offset] = log_len as Field;
            offset += 1;
            for j in 0..log_len {
                reconstructed_tx_effects[offset] = log_fields[j];
                offset += 1;
            }
        }
        // public logs
        let public_logs_prefix = encode_blob_prefix(PUBLIC_LOGS_PREFIX, NUM_PUBLIC_LOGS);
        reconstructed_tx_effects[offset] = public_logs_prefix;
        offset += 1;
        for i in 0..pub_log_lengths.len() {
            let log_len = pub_log_lengths[i];
            let log_fields = builder.avm_data.public_logs.get(i).log.fields;
            reconstructed_tx_effects[offset] = log_len as Field;
            offset += 1;
            reconstructed_tx_effects[offset] = builder.tube_data.contract_address.to_field();
            offset += 1;
            for j in 0..log_len {
                reconstructed_tx_effects[offset] = log_fields[j];
                offset += 1;
            }
        }
        // cc logs
        let contract_class_logs_prefix =
            encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, NUM_CC_LOGS);
        reconstructed_tx_effects[offset] = contract_class_logs_prefix;
        offset += 1;
        for i in 0..cc_log_lengths.len() {
            let log_len = cc_log_lengths[i];
            reconstructed_tx_effects[offset] = log_len as Field;
            offset += 1;
            reconstructed_tx_effects[offset] = builder.tube_data.contract_address.to_field();
            offset += 1;
            let log_fields = builder.contract_class_log_fields.get(i);
            for j in 0..log_len {
                reconstructed_tx_effects[offset] = log_fields[j];
                offset += 1;
            }
        }

        // Initial field = TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
        // revert code = 0
        let length_bytes = (offset as Field).to_be_bytes::<2>();
        reconstructed_tx_effects[0] = field_from_bytes(
            array_concat(
                TX_START_PREFIX.to_be_bytes::<8>(),
                [0, length_bytes[0], length_bytes[1], 0, REVERT_CODE_PREFIX, 0, 0],
            ),
            true,
        );

        let mut expected_sponge = outputs.start_sponge_blob;
        expected_sponge.absorb(reconstructed_tx_effects, offset);
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    // TODO: Break up components.nr and test directly with `get_tx_effects_hash_input`.
    #[test(should_fail_with = "Index out of bounds")]
    unconstrained fn private_log_length_too_large_fails() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Create a log whose length is larger than the max allowed.
        builder.tube_data.append_private_logs_with_lengths([PRIVATE_LOG_SIZE_IN_FIELDS + 1]);

        let _ = builder.execute();
    }

    #[test(should_fail_with = "Index out of bounds")]
    unconstrained fn public_log_length_too_large_fails() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Create a log whose length is larger than the max allowed.
        builder.avm_data.append_public_logs_with_lengths([PUBLIC_LOG_SIZE_IN_FIELDS + 1]);

        let _ = builder.execute();
    }

    #[test(should_fail_with = "Index out of bounds")]
    unconstrained fn contract_class_log_length_too_large_fails() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.append_contract_class_log([11, 22, 33]);
        let mut invalid_log_hash = builder.tube_data.contract_class_logs_hashes.pop();
        // Tweak the length of the log hash to be larger than the max allowed.
        invalid_log_hash.inner.inner.length = CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1;
        builder.tube_data.contract_class_logs_hashes.push(invalid_log_hash);

        let _ = builder.execute();
    }

    #[test]
    unconstrained fn empty_block_out_hash() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();
        assert_eq(outputs.out_hash, 0);
    }

    #[test]
    unconstrained fn nonempty_block_out_hash() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.tube_data.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
        builder.avm_data.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);

        let out_hash = builder.execute().out_hash;

        let siloed_l2_to_l1_msgs = builder.avm_data.l2_to_l1_msgs.map(|l2_to_l1_message| silo_l2_to_l1_message(
            l2_to_l1_message.expose_to_public(),
            builder.constants.global_variables.version,
            builder.constants.global_variables.chain_id,
        ));

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

    #[test]
    unconstrained fn allows_clamping_of_gas_settings_in_avm() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        let gas_used_by_private = Gas::new(0, 1000);

        builder.tube_data.gas_used = gas_used_by_private;
        builder.avm_data.start_gas_used = gas_used_by_private;

        let mut gas_settings = GasSettings {
            gas_limits: Gas::new(
                0,
                MAX_L2_GAS_PER_TX_PUBLIC_PORTION + gas_used_by_private.l2_gas + 1,
            ),
            teardown_gas_limits: Gas::new(0, MAX_L2_GAS_PER_TX_PUBLIC_PORTION + 1),
            max_fees_per_gas: GasFees::new(0, 0),
            max_priority_fees_per_gas: GasFees::new(0, 0),
        };

        builder.tube_data.tx_context.gas_settings = gas_settings;
        // Clamped values in the AVM
        gas_settings.gas_limits.l2_gas =
            MAX_L2_GAS_PER_TX_PUBLIC_PORTION + gas_used_by_private.l2_gas;
        gas_settings.teardown_gas_limits.l2_gas = MAX_L2_GAS_PER_TX_PUBLIC_PORTION;
        builder.avm_data.tx_context.gas_settings = gas_settings;

        builder.succeeds();
    }

    #[test(should_fail_with = "unexpected gas settings used in the AVM")]
    unconstrained fn wrong_clamping_of_gas_settings_in_avm() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        let gas_used_by_private = Gas::new(0, 1000);

        builder.tube_data.gas_used = gas_used_by_private;
        builder.avm_data.start_gas_used = gas_used_by_private;

        let gas_settings = GasSettings {
            gas_limits: Gas::new(
                0,
                MAX_L2_GAS_PER_TX_PUBLIC_PORTION + gas_used_by_private.l2_gas + 1,
            ),
            teardown_gas_limits: Gas::new(0, MAX_L2_GAS_PER_TX_PUBLIC_PORTION + 1),
            max_fees_per_gas: GasFees::new(0, 0),
            max_priority_fees_per_gas: GasFees::new(0, 0),
        };

        builder.tube_data.tx_context.gas_settings = gas_settings;
        builder.avm_data.tx_context.gas_settings = gas_settings;

        builder.fails();
    }

    #[test]
    unconstrained fn avm_effective_gas_fees() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.gas_fees = GasFees::new(100, 100);
        builder.avm_data.global_variables.gas_fees = builder.constants.global_variables.gas_fees;

        let gas_settings = GasSettings {
            gas_limits: Gas::new(1000, MAX_L2_GAS_PER_TX_PUBLIC_PORTION),
            teardown_gas_limits: Gas::new(1000, 1000),
            max_fees_per_gas: GasFees::new(150, 150),
            max_priority_fees_per_gas: GasFees::new(100, 100),
        };
        builder.tube_data.tx_context.gas_settings = gas_settings;
        builder.avm_data.tx_context.gas_settings = gas_settings;

        // Effective should be 150 taking 50 as priority fees.
        builder.avm_data.effective_gas_fees = GasFees::new(150, 150);

        builder.succeeds();
    }

    #[test(should_fail_with = "unexpected effective gas fees used in the AVM")]
    unconstrained fn wrong_avm_effective_gas_fees() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.gas_fees = GasFees::new(100, 100);
        builder.avm_data.global_variables.gas_fees = builder.constants.global_variables.gas_fees;

        let gas_settings = GasSettings {
            gas_limits: Gas::new(1000, MAX_L2_GAS_PER_TX_PUBLIC_PORTION),
            teardown_gas_limits: Gas::new(1000, 1000),
            max_fees_per_gas: GasFees::new(150, 150),
            max_priority_fees_per_gas: GasFees::new(25, 25),
        };
        builder.tube_data.tx_context.gas_settings = gas_settings;
        builder.avm_data.tx_context.gas_settings = gas_settings;

        // Effective should be 125 taking all priority fees.
        builder.avm_data.effective_gas_fees = GasFees::new(150, 150);

        builder.fails();
    }

}
