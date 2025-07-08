use crate::{
    abis::{base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs, tx_effect::TxEffect},
    base::{
        components::{
            fees::{compute_fee_payer_fee_juice_balance_leaf_slot, compute_transaction_fee},
            nullifier_tree::nullifier_tree_batch_insert,
            PrivateTubeDataValidator,
            public_data_tree::public_data_tree_insert,
        },
        state_diff_hints::PrivateBaseStateDiffHints,
    },
    components::{append_tx_effects_for_blob, compute_kernel_out_hash, validate_contract_class_log},
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
        contract_class_log::ContractClassLog, log::Log, public_data_write::PublicDataWrite,
        public_log::PublicLog, sponge_blob::SpongeBlob, tube::PrivateTubeData,
    },
    constants::{
        ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_PUBLIC_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NOTE_HASH_SUBTREE_HEIGHT,
    },
    data::{hash::compute_public_data_tree_value, public_data_hint::PublicDataHint},
    hash::silo_l2_to_l1_message,
    merkle_tree::{
        append_only_tree, calculate_empty_tree_root, calculate_subtree_root, MembershipWitness,
    },
    partial_state_reference::PartialStateReference,
    traits::{Empty, Hash},
};

pub struct PrivateBaseRollupInputs {
    tube_data: PrivateTubeData,

    start: PartialStateReference,
    start_sponge_blob: SpongeBlob,

    state_diff_hints: PrivateBaseStateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    constants: BlockConstantData,
}

impl PrivateBaseRollupInputs {
    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        let tube_data_validator = PrivateTubeDataValidator::new(self.tube_data);
        tube_data_validator.validate_proof_and_vk();
        tube_data_validator.validate_with_block_constant_data(
            self.constants,
            self.archive_root_membership_witness,
        );

        let commitments_tree_subroot = self.calculate_commitments_subtree();

        let empty_commitments_subtree_root = calculate_empty_tree_root(NOTE_HASH_SUBTREE_HEIGHT);

        let end_note_hash_tree_snapshot = append_only_tree::insert_subtree_to_snapshot_tree(
            self.start.note_hash_tree,
            self.state_diff_hints.note_hash_subtree_sibling_path,
            empty_commitments_subtree_root,
            commitments_tree_subroot,
            NOTE_HASH_SUBTREE_HEIGHT as u8,
        );

        // Insert nullifiers:
        let end_nullifier_tree_snapshot =
            self.check_nullifier_tree_non_membership_and_insert_to_tree();

        let transaction_fee = compute_transaction_fee(
            self.constants.global_variables.gas_fees,
            self.tube_data.public_inputs.constants.tx_context.gas_settings,
            self.tube_data.public_inputs.gas_used,
        );

        // Write fee to public data tree
        let fee_public_data_write = self.build_fee_public_data_write(transaction_fee);
        let end_public_data_tree_snapshot =
            self.insert_fee_public_data_write(fee_public_data_write);
        let mut all_public_data_update_requests =
            [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        all_public_data_update_requests[0] = fee_public_data_write;

        // Silo the L2 to L1 messages and compute the out hash.
        let siloed_l2_to_l1_msgs = self.tube_data.public_inputs.end.l2_to_l1_msgs.map(|message| silo_l2_to_l1_message(
            message,
            self.tube_data.public_inputs.constants.tx_context.version,
            self.tube_data.public_inputs.constants.tx_context.chain_id,
        ));

        let out_hash = compute_kernel_out_hash(siloed_l2_to_l1_msgs);

        // Validate the contract class log hashes.
        let mut contract_class_logs = [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX];
        let contract_class_logs_hashes =
            self.tube_data.public_inputs.end.contract_class_logs_hashes;
        for i in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            let log_hash = contract_class_logs_hashes[i];
            let log_fields = self.contract_class_log_fields[i];
            validate_contract_class_log(log_hash, log_fields);

            contract_class_logs[i] = ContractClassLog {
                log: Log::new(log_fields, log_hash.inner.length),
                contract_address: log_hash.contract_address,
            };
        }

        // Append the tx effects for blob(s).
        let tx_effect = TxEffect {
            tx_hash: self.tube_data.public_inputs.hash(),
            revert_code: 0,
            transaction_fee,
            note_hashes: self.tube_data.public_inputs.end.note_hashes,
            nullifiers: self.tube_data.public_inputs.end.nullifiers,
            l2_to_l1_msgs: siloed_l2_to_l1_msgs,
            public_data_writes: all_public_data_update_requests,
            private_logs: self.tube_data.public_inputs.end.private_logs,
            public_logs: [PublicLog::empty(); MAX_PUBLIC_LOGS_PER_TX],
            contract_class_logs,
        };
        let end_sponge_blob = append_tx_effects_for_blob(tx_effect, self.start_sponge_blob);

        BaseOrMergeRollupPublicInputs {
            num_txs: 1,
            constants: self.constants,
            start: self.start,
            end: PartialStateReference {
                note_hash_tree: end_note_hash_tree_snapshot,
                nullifier_tree: end_nullifier_tree_snapshot,
                public_data_tree: end_public_data_tree_snapshot,
            },
            start_sponge_blob: self.start_sponge_blob,
            end_sponge_blob,
            out_hash,
            accumulated_fees: transaction_fee,
            accumulated_mana_used: self.tube_data.public_inputs.gas_used.l2_gas as Field,
        }
    }

    // TODO(Kev): This should say calculate_commitments_subtree_root
    // Cpp code says calculate_commitments_subtree, so I'm leaving it as is for now
    fn calculate_commitments_subtree(self) -> Field {
        calculate_subtree_root(self.tube_data.public_inputs.end.note_hashes)
    }

    fn check_nullifier_tree_non_membership_and_insert_to_tree(self) -> AppendOnlyTreeSnapshot {
        nullifier_tree_batch_insert(
            self.start.nullifier_tree,
            self.tube_data.public_inputs.end.nullifiers,
            self.state_diff_hints.sorted_nullifiers,
            self.state_diff_hints.sorted_nullifier_indexes,
            self.state_diff_hints.nullifier_subtree_sibling_path,
            self.state_diff_hints.nullifier_predecessor_preimages,
            self.state_diff_hints.nullifier_predecessor_membership_witnesses,
        )
    }

    fn build_fee_public_data_write(self, tx_fee: Field) -> PublicDataWrite {
        let fee_payer = self.tube_data.public_inputs.fee_payer;
        let leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);

        let read_hint = self.fee_payer_fee_juice_balance_read_hint;
        read_hint.validate(self.start.public_data_tree.root);

        let balance = read_hint.value;
        assert_eq(
            read_hint.leaf_slot,
            leaf_slot,
            "Wrong leaf slot for Fee Juice balance read hint",
        );
        assert(!balance.lt(tx_fee), "Not enough balance for fee payer to pay for transaction");

        let value = compute_public_data_tree_value(balance - tx_fee);
        PublicDataWrite { leaf_slot, value }
    }

    fn insert_fee_public_data_write(self, fee_write: PublicDataWrite) -> AppendOnlyTreeSnapshot {
        public_data_tree_insert(
            fee_write,
            self.start.public_data_tree,
            self.state_diff_hints.fee_write_low_leaf_preimage,
            self.state_diff_hints.fee_write_low_leaf_membership_witness,
            self.state_diff_hints.fee_write_sibling_path,
        )
    }
}

mod tests {
    use crate::{
        abis::{
            base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs, tx_effect::TxEffect,
        },
        base::{
            components::fees::compute_fee_payer_fee_juice_balance_leaf_slot,
            private_base_rollup::PrivateBaseRollupInputs,
            state_diff_hints::PrivateBaseStateDiffHints,
        },
        components::{
            append_tx_effects_for_blob, encode_blob_prefix, TX_EFFECTS_BLOB_HASH_INPUT_FIELDS,
        },
    };
    use dep::types::{
        abis::{
            append_only_tree_snapshot::AppendOnlyTreeSnapshot,
            block_constant_data::BlockConstantData, gas::Gas, gas_fees::GasFees,
            kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
            nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
            side_effect::OrderedValue, sponge_blob::SpongeBlob,
        },
        address::AztecAddress,
        constants::{
            CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_LOGS_PREFIX, L2_L1_MSGS_PREFIX,
            MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
            MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            NOTE_HASH_SUBTREE_HEIGHT, NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_TREE_HEIGHT,
            NOTES_PREFIX, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
            NULLIFIER_TREE_HEIGHT, NULLIFIERS_PREFIX, PRIVATE_LOGS_PREFIX, PRIVATE_TUBE_VK_INDEX,
            PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, REVERT_CODE_PREFIX,
            TX_FEE_PREFIX, TX_START_PREFIX,
        },
        data::{public_data_hint::PublicDataHint, PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
        hash::{compute_contract_class_log_hash, silo_l2_to_l1_message},
        merkle_tree::MembershipWitness,
        partial_state_reference::PartialStateReference,
        tests::{
            fixture_builder::FixtureBuilder,
            fixtures::{self, merkle_tree::generate_full_sha_tree},
            merkle_tree_utils::NonEmptyMerkleTree,
        },
        traits::{Empty, FromField, Hash, ToField},
        utils::{
            arrays::get_sorted_tuple::get_sorted_tuple,
            field::{field_from_bytes, full_field_less_than},
        },
    };

    #[derive(Eq)]
    struct NullifierInsertion {
        existing_index: u32,
        value: Field,
    }

    global MAX_NULLIFIERS_PER_TEST: u32 = 4;
    global AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST: u32 = 64;
    global AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST: u32 = 6;
    global PRE_EXISTING_PUBLIC_DATA_LEAVES: u32 = 10;

    fn update_public_data_tree<let AVAILABLE_LEAVES: u32, let EXISTING_LEAVES: u32, let SUBTREE_SIBLING_PATH_LENGTH: u32, let SUBTREE_HEIGHT: u32>(
        public_data_tree: &mut NonEmptyMerkleTree<AVAILABLE_LEAVES, PUBLIC_DATA_TREE_HEIGHT, SUBTREE_SIBLING_PATH_LENGTH, SUBTREE_HEIGHT>,
        snapshot: AppendOnlyTreeSnapshot,
        pre_existing_public_data: [PublicDataTreeLeafPreimage; EXISTING_LEAVES],
        low_leaf_index: u32,
        fee_write: PublicDataTreeLeaf,
    ) -> (PublicDataTreeLeafPreimage, MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>, [Field; PUBLIC_DATA_TREE_HEIGHT]) {
        let low_leaf = pre_existing_public_data[low_leaf_index];
        let mut new_low_leaf = pre_existing_public_data[low_leaf_index];
        let mut new_leaf = PublicDataTreeLeafPreimage::empty();
        if low_leaf.slot == fee_write.slot {
            new_low_leaf.value = fee_write.value;
        } else {
            new_low_leaf.next_slot = fee_write.slot;
            new_low_leaf.next_index = PRE_EXISTING_PUBLIC_DATA_LEAVES;

            new_leaf = PublicDataTreeLeafPreimage {
                slot: fee_write.slot,
                value: fee_write.value,
                next_slot: low_leaf.next_slot,
                next_index: low_leaf.next_index,
            };
        }

        // Update low leaf.
        let low_public_data_writes_witness = MembershipWitness {
            leaf_index: low_leaf_index as Field,
            sibling_path: public_data_tree.get_sibling_path(low_leaf_index),
        };
        public_data_tree.update_leaf(low_leaf_index, new_low_leaf.hash());

        let insertion_witness =
            public_data_tree.get_sibling_path(snapshot.next_available_leaf_index);
        public_data_tree.update_leaf(snapshot.next_available_leaf_index, new_leaf.hash());

        (low_leaf, low_public_data_writes_witness, insertion_witness)
    }

    struct PrivateBaseRollupInputsBuilder {
        tube_data: FixtureBuilder,
        pre_existing_notes: [Field; MAX_NOTE_HASHES_PER_TX],
        pre_existing_nullifiers: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
        pre_existing_contracts: [Field; 2],
        pre_existing_public_data: [PublicDataTreeLeafPreimage; PRE_EXISTING_PUBLIC_DATA_LEAVES],

        nullifiers: BoundedVec<NullifierInsertion, MAX_NULLIFIERS_PER_TEST>,
        constants: BlockConstantData,

        fee_payer: AztecAddress,
        // Index of the low leaf for the leaf that contains the fee payer's Fee Juice balance.
        // Used for building the public data hint read for the payment update request.
        fee_payer_balance_leaf_index: u32,

        contract_class_log_fields: BoundedVec<[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS], MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    }

    impl PrivateBaseRollupInputsBuilder {
        fn new() -> Self {
            let mut tube_data =
                FixtureBuilder::new().in_vk_tree(PRIVATE_TUBE_VK_INDEX).use_last_archive();

            let mut constants = BlockConstantData::empty();
            constants.global_variables.chain_id = fixtures::CHAIN_ID;
            constants.global_variables.version = fixtures::VERSION;
            constants.vk_tree_root = tube_data.vk_tree_root;
            constants.protocol_contract_tree_root = tube_data.protocol_contract_tree_root;

            // Gas and fee.
            tube_data.gas_used = Gas::new(11, 22);
            let gas_fees = GasFees { fee_per_da_gas: 1, fee_per_l2_gas: 2 };
            tube_data.tx_context.gas_settings.max_fees_per_gas = gas_fees;
            constants.global_variables.gas_fees = gas_fees;

            let fee_payer = AztecAddress::from_field(234234);
            tube_data.set_fee_payer(fee_payer);
            let fee_payer_balance_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);

            let mut pre_existing_public_data =
                [PublicDataTreeLeafPreimage::empty(); PRE_EXISTING_PUBLIC_DATA_LEAVES];
            // Add the fee payer's balance to the public data at index 1.
            let fee_payer_balance_leaf_index = 1;
            let fee_payer_balance = 0x999;
            pre_existing_public_data[fee_payer_balance_leaf_index] = PublicDataTreeLeafPreimage {
                slot: fee_payer_balance_slot,
                value: fee_payer_balance,
                next_slot: 0,
                next_index: 0,
            };
            // Point the first public data to the above data.
            pre_existing_public_data[0] = PublicDataTreeLeafPreimage {
                slot: 0,
                value: 0,
                next_slot: fee_payer_balance_slot,
                next_index: 1,
            };

            PrivateBaseRollupInputsBuilder {
                tube_data,
                pre_existing_notes: [0; MAX_NOTE_HASHES_PER_TX],
                pre_existing_nullifiers: [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX],
                pre_existing_contracts: [0; 2],
                pre_existing_public_data,
                nullifiers: BoundedVec::new(),
                constants,
                fee_payer,
                fee_payer_balance_leaf_index,
                contract_class_log_fields: BoundedVec::new(),
            }
        }

        unconstrained fn new_with_previous_kernel(previous_vk_index: u32) -> Self {
            let mut builder = PrivateBaseRollupInputsBuilder::new();
            builder.tube_data = builder.tube_data.in_vk_tree(previous_vk_index);
            builder
        }

        fn build_fee_payer_fee_juice_balance_read_hint(
            self,
            start_public_data_tree: NonEmptyMerkleTree<AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST, PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT - AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST, AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST>,
        ) -> PublicDataHint {
            let leaf_index = self.fee_payer_balance_leaf_index as Field;
            let leaf_preimage = self.pre_existing_public_data[leaf_index as u32];
            let membership_witness = MembershipWitness {
                leaf_index,
                sibling_path: start_public_data_tree.get_sibling_path(
                    self.fee_payer_balance_leaf_index,
                ),
            };
            PublicDataHint {
                leaf_slot: leaf_preimage.slot,
                value: leaf_preimage.value,
                membership_witness,
                leaf_preimage,
            }
        }

        fn compute_transaction_fee(self) -> Field {
            let gas_fees = self.constants.global_variables.gas_fees;
            let gas_used = self.tube_data.gas_used;
            gas_used.compute_fee(gas_fees)
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
            res.public_data_writes = all_public_data_update_requests.concat(
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

        fn update_nullifier_tree_with_new_leaves(
            mut self,
            nullifier_tree: &mut NonEmptyMerkleTree<MAX_NULLIFIERS_PER_TX, NULLIFIER_TREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_SUBTREE_HEIGHT>,
            kernel_public_inputs: &mut PrivateToRollupKernelCircuitPublicInputs,
            start_nullifier_tree_snapshot: AppendOnlyTreeSnapshot,
        ) -> ([NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX], [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX], [Field; MAX_NULLIFIERS_PER_TX], [u32; MAX_NULLIFIERS_PER_TX]) {
            let mut nullifier_predecessor_preimages =
                [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX];
            let mut low_nullifier_membership_witness =
                [MembershipWitness::empty(); MAX_NULLIFIERS_PER_TX];

            // Safety: This is a mock for testing only
            let sorted_new_nullifier_tuples = unsafe {
                get_sorted_tuple(
                    self.nullifiers.storage().map(|insertion: NullifierInsertion| insertion.value),
                    |a, b| full_field_less_than(b, a),
                )
            };

            let mut sorted_nullifiers = [0; MAX_NULLIFIERS_PER_TX];
            let mut sorted_nullifiers_indexes = [0; MAX_NULLIFIERS_PER_TX];

            for i in 0..MAX_NULLIFIERS_PER_TX {
                if (i as u32) < (MAX_NULLIFIERS_PER_TEST as u32) {
                    sorted_nullifiers[i] = sorted_new_nullifier_tuples[i].elem;
                    sorted_nullifiers_indexes[i] = sorted_new_nullifier_tuples[i].original_index;
                } else {
                    sorted_nullifiers[i] = 0;
                    sorted_nullifiers_indexes[i] = i;
                }
            }

            let mut pre_existing_nullifiers = self.pre_existing_nullifiers;

            for i in 0..MAX_NULLIFIERS_PER_TEST {
                if i < self.nullifiers.len() {
                    let sorted_tuple = sorted_new_nullifier_tuples[i];
                    let new_nullifier = sorted_tuple.elem;
                    let original_index = sorted_tuple.original_index;

                    let low_index = self.nullifiers.get_unchecked(original_index).existing_index;

                    kernel_public_inputs.end.nullifiers[original_index] = new_nullifier;

                    let mut low_preimage = pre_existing_nullifiers[low_index];
                    nullifier_predecessor_preimages[i] = low_preimage;
                    low_nullifier_membership_witness[i] = MembershipWitness {
                        leaf_index: low_index as Field,
                        sibling_path: nullifier_tree.get_sibling_path(low_index),
                    };

                    low_preimage.next_nullifier = new_nullifier;
                    low_preimage.next_index = start_nullifier_tree_snapshot
                        .next_available_leaf_index as u32
                        + original_index;
                    pre_existing_nullifiers[low_index] = low_preimage;

                    nullifier_tree.update_leaf(low_index, low_preimage.hash());
                }
            }

            (
                nullifier_predecessor_preimages, low_nullifier_membership_witness,
                sorted_nullifiers, sorted_nullifiers_indexes,
            )
        }

        // Exists separately to allow us to append correct log preimages and hashes
        unconstrained fn append_contract_class_log<let N: u32>(&mut self, log_fields: [Field; N]) {
            let padded_log_fields: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] =
                log_fields.concat([0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - N]);
            self.contract_class_log_fields.push(padded_log_fields);

            let log_hash = compute_contract_class_log_hash(padded_log_fields);
            self.tube_data.add_contract_class_log_hash(log_hash, N);
        }

        unconstrained fn build_inputs(mut self) -> PrivateBaseRollupInputs {
            let mut tube_data = self.tube_data.to_private_tube_data();

            let start_note_hash_tree = NonEmptyMerkleTree::new(
                self.pre_existing_notes,
                [0; NOTE_HASH_TREE_HEIGHT],
                [0; NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT],
                [0; NOTE_HASH_SUBTREE_HEIGHT],
            );
            let start_note_hash_tree_snapshot = AppendOnlyTreeSnapshot {
                root: start_note_hash_tree.get_root(),
                next_available_leaf_index: start_note_hash_tree.get_next_available_index() as u32,
            };
            let note_hash_subtree_sibling_path = PrivateBaseRollupInputsBuilder::extract_subtree_sibling_path(
                start_note_hash_tree.get_sibling_path(self.pre_existing_notes.len()),
                [0; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
            );

            let mut start_nullifier_tree = NonEmptyMerkleTree::new(
                self.pre_existing_nullifiers.map(|preimage: NullifierLeafPreimage| preimage.hash()),
                [0; NULLIFIER_TREE_HEIGHT],
                [0; NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT],
                [0; NULLIFIER_SUBTREE_HEIGHT],
            );

            let start_nullifier_tree_snapshot = AppendOnlyTreeSnapshot {
                root: start_nullifier_tree.get_root(),
                next_available_leaf_index: start_nullifier_tree.get_next_available_index() as u32,
            };

            let mut pre_existing_leaves = [0; AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST];
            for i in 0..self.pre_existing_public_data.len() {
                pre_existing_leaves[i] = self.pre_existing_public_data[i].hash();
            }

            let mut start_public_data_tree = NonEmptyMerkleTree::new(
                pre_existing_leaves,
                [0; PUBLIC_DATA_TREE_HEIGHT],
                [0; PUBLIC_DATA_TREE_HEIGHT - AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST],
                [0; AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST],
            );
            let start_public_data_tree_snapshot = AppendOnlyTreeSnapshot {
                root: start_public_data_tree.get_root(),
                next_available_leaf_index: self.pre_existing_public_data.len(),
            };

            self.constants.last_archive = self.tube_data.archive_tree;

            let (nullifier_predecessor_preimages, nullifier_predecessor_membership_witnesses, sorted_nullifiers, sorted_nullifier_indexes) = self
                .update_nullifier_tree_with_new_leaves(
                    &mut start_nullifier_tree,
                    &mut tube_data.public_inputs,
                    start_nullifier_tree_snapshot,
                );

            let nullifier_subtree_sibling_path = PrivateBaseRollupInputsBuilder::extract_subtree_sibling_path(
                start_nullifier_tree.get_sibling_path(self.pre_existing_nullifiers.len()),
                [0; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
            );

            let fee_payer_fee_juice_balance_read_hint =
                self.build_fee_payer_fee_juice_balance_read_hint(start_public_data_tree);

            let fee_write = self.get_fee_write();
            let (fee_write_low_leaf_preimage, fee_write_low_leaf_membership_witness, fee_write_sibling_path) = update_public_data_tree(
                &mut start_public_data_tree,
                start_public_data_tree_snapshot,
                self.pre_existing_public_data,
                self.fee_payer_balance_leaf_index,
                fee_write,
            );

            let start = PartialStateReference {
                note_hash_tree: start_note_hash_tree_snapshot,
                nullifier_tree: start_nullifier_tree_snapshot,
                public_data_tree: start_public_data_tree_snapshot,
            };

            let pre_existing_tx_effects = self.build_pre_existing_tx_effects();

            let start_sponge_blob = append_tx_effects_for_blob(
                pre_existing_tx_effects,
                SpongeBlob::new(TX_EFFECTS_BLOB_HASH_INPUT_FIELDS),
            );

            let state_diff_hints = PrivateBaseStateDiffHints {
                nullifier_predecessor_preimages,
                nullifier_predecessor_membership_witnesses,
                sorted_nullifiers,
                sorted_nullifier_indexes,
                note_hash_subtree_sibling_path,
                nullifier_subtree_sibling_path,
                fee_write_low_leaf_preimage,
                fee_write_low_leaf_membership_witness,
                fee_write_sibling_path,
            };

            PrivateBaseRollupInputs {
                tube_data,
                start,
                start_sponge_blob,
                state_diff_hints,
                archive_root_membership_witness: self.tube_data.archive_root_membership_witness,
                constants: self.constants,
                fee_payer_fee_juice_balance_read_hint,
                contract_class_log_fields: self.contract_class_log_fields.storage(),
            }
        }

        fn get_fee_write(self) -> PublicDataTreeLeaf {
            let pre_public_data = self.pre_existing_public_data[self.fee_payer_balance_leaf_index];
            let balance = pre_public_data.value;
            let fee = self.compute_transaction_fee();
            let value = if balance.lt(fee) { 0 } else { balance - fee };
            PublicDataTreeLeaf { slot: pre_public_data.slot, value }
        }

        fn set_fee_payer_balance(&mut self, balance: Field) {
            self.pre_existing_public_data[self.fee_payer_balance_leaf_index].value = balance;
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

    #[test]
    unconstrained fn note_hashes_tree() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        let note_hashes = [27, 28, 29, 30, 31, 32];
        for i in 0..note_hashes.len() {
            builder.tube_data.add_new_note_hash(note_hashes[i]);
        }
        let mut expected_commitments_tree = NonEmptyMerkleTree::new(
            [0; MAX_NOTE_HASHES_PER_TX * 2],
            [0; NOTE_HASH_TREE_HEIGHT],
            [0; NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT - 1],
            [0; NOTE_HASH_SUBTREE_HEIGHT + 1],
        );

        let outputs = builder.execute();
        let expected_start_note_hash_tree_snapshot = AppendOnlyTreeSnapshot {
            root: expected_commitments_tree.get_root(),
            next_available_leaf_index: MAX_NOTE_HASHES_PER_TX as u32,
        };
        assert(outputs.start.note_hash_tree.eq(expected_start_note_hash_tree_snapshot));

        for i in 0..note_hashes.len() {
            expected_commitments_tree.update_leaf(i + MAX_NOTE_HASHES_PER_TX, note_hashes[i]);
        }
        let expected_end_note_hash_tree_snapshot = AppendOnlyTreeSnapshot {
            root: expected_commitments_tree.get_root(),
            next_available_leaf_index: (MAX_NOTE_HASHES_PER_TX * 2) as u32,
        };
        assert(outputs.end.note_hash_tree.eq(expected_end_note_hash_tree_snapshot));
    }

    #[test]
    unconstrained fn new_nullifier_tree_empty() {
        // This test checks for insertions of all 0 values
        // In this special case we will not need to provide sibling paths to check insertion of the nullifier values
        // This is because 0 values are not actually inserted into the tree, rather the inserted subtree is left
        // empty to begin with.
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.succeeds();
    }

    #[test]
    unconstrained fn nullifier_insertion_test() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.nullifiers.push(NullifierInsertion { existing_index: 0, value: 1 });
        let mut tree_nullifiers = [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX * 2];
        tree_nullifiers[0] = NullifierLeafPreimage {
            nullifier: 0,
            next_nullifier: 1,
            next_index: MAX_NULLIFIERS_PER_TX,
        };
        tree_nullifiers[1] = builder.pre_existing_nullifiers[1];
        tree_nullifiers[MAX_NULLIFIERS_PER_TX] =
            NullifierLeafPreimage { nullifier: 1, next_nullifier: 7, next_index: 1 };

        let mut end_nullifier_tree = NonEmptyMerkleTree::new(
            tree_nullifiers.map(|preimage: NullifierLeafPreimage| preimage.hash()),
            [0; NULLIFIER_TREE_HEIGHT],
            [0; NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT - 1],
            [0; NULLIFIER_SUBTREE_HEIGHT + 1],
        );

        let output = builder.execute();

        assert(output.end.nullifier_tree.eq(
            AppendOnlyTreeSnapshot {
                root: end_nullifier_tree.get_root(),
                next_available_leaf_index: 2 * MAX_NULLIFIERS_PER_TX as u32,
            },
        ));
    }

    #[test]
    unconstrained fn new_nullifier_tree_all_larger() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });
        for i in 1..builder.nullifiers.max_len() {
            builder.nullifiers.push(
                NullifierInsertion { existing_index: 1, value: (8 + i) as Field },
            );
        }

        let output = builder.execute();
        let mut tree_nullifiers = [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX * 2];
        tree_nullifiers[0] = builder.pre_existing_nullifiers[0];

        tree_nullifiers[1] = NullifierLeafPreimage {
            nullifier: 7,
            next_nullifier: 8,
            next_index: MAX_NULLIFIERS_PER_TX,
        };

        let last_index = builder.nullifiers.max_len() - 1;
        for i in 0..last_index {
            tree_nullifiers[MAX_NULLIFIERS_PER_TX + i] = NullifierLeafPreimage {
                nullifier: (8 + i) as Field,
                next_nullifier: (8 + i + 1) as Field,
                next_index: MAX_NULLIFIERS_PER_TX + i + 1,
            };
        }
        tree_nullifiers[MAX_NULLIFIERS_PER_TX + last_index] = NullifierLeafPreimage {
            nullifier: (8 + last_index) as Field,
            next_nullifier: 0,
            next_index: 0,
        };

        let mut end_nullifier_tree = NonEmptyMerkleTree::new(
            tree_nullifiers.map(|preimage: NullifierLeafPreimage| preimage.hash()),
            [0; NULLIFIER_TREE_HEIGHT],
            [0; NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT - 1],
            [0; NULLIFIER_SUBTREE_HEIGHT + 1],
        );

        assert(output.end.nullifier_tree.eq(
            AppendOnlyTreeSnapshot {
                root: end_nullifier_tree.get_root(),
                next_available_leaf_index: 2 * MAX_NULLIFIERS_PER_TX as u32,
            },
        ));
    }

    #[test(should_fail_with = "Invalid low leaf")]
    unconstrained fn new_nullifier_tree_double_spend() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });
        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });

        builder.fails();
    }

    #[test(should_fail_with = "Invalid low leaf")]
    unconstrained fn new_nullifier_tree_double_spend_same_batch() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });
        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });

        builder.fails();
    }

    #[test]
    unconstrained fn non_empty_tx_effects_sponge() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.tube_data.append_note_hashes(50);
        let inputs = builder.build_inputs();
        let outputs = inputs.execute();
        let mut tx_effects = [0; 57];
        // Initial field = TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
        // The first 3 are:
        //   - i=0 init field
        //   - i=1: tx hash
        //   - i=2: tx fee
        // Followed by:
        //   - Note prefix
        //   - 50 note hashes
        //   - Public data write prefix
        //   - 1 public data write (2 fields)
        tx_effects[0] = field_from_bytes(
            TX_START_PREFIX.to_be_bytes::<8>().concat([
                0,
                0,
                tx_effects.len() as u8,
                0,
                REVERT_CODE_PREFIX,
                0,
                0,
            ]),
            true,
        );

        // TX hash
        tx_effects[1] = inputs.tube_data.public_inputs.hash();

        // Transaction fee.
        let transaction_fee = builder.compute_transaction_fee();
        tx_effects[2] = field_from_bytes(
            [TX_FEE_PREFIX, 0].concat(transaction_fee.to_be_bytes::<29>()),
            true,
        );

        let mut offset = 3;

        // Note hashes.
        tx_effects[offset] = encode_blob_prefix(NOTES_PREFIX, 50);
        offset += 1;
        for i in 0..50 {
            tx_effects[i + offset] = builder.tube_data.note_hashes.storage()[i].value();
        }
        offset += 50;

        // Public data writes.
        tx_effects[offset] = encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, 1);
        offset += 1;
        let fee_write = builder.get_fee_write();
        tx_effects[offset] = fee_write.slot;
        tx_effects[offset + 1] = fee_write.value;

        let mut expected_sponge = outputs.start_sponge_blob;
        expected_sponge.absorb(tx_effects, tx_effects.len());
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    #[test]
    unconstrained fn fuller_tx_effects_sponge() {
        let NUM_NOTES = 25;
        let NUM_NULLIFIERS = 3;
        let NUM_MSGS = 5;
        let private_log_lengths = [3, 8, 1, 5];
        let NUM_PRIVATE_LOGS = private_log_lengths.len();
        let cc_log_0 = [58, 79, 14];
        let cc_log_lengths = [cc_log_0.len()];
        let NUM_CC_LOGS = cc_log_lengths.len();

        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.tube_data.set_gas_used(100, 200);
        builder.constants.global_variables.gas_fees.fee_per_da_gas = 1;
        builder.constants.global_variables.gas_fees.fee_per_l2_gas = 1;
        builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_da_gas = 1;
        builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_l2_gas = 1;
        let tx_fee = builder.compute_transaction_fee();
        // builder.transaction_fee = tx_fee;
        builder.tube_data.append_note_hashes(NUM_NOTES);
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
        builder.tube_data.append_private_logs_with_lengths(private_log_lengths);
        builder.append_contract_class_log(cc_log_0);
        let inputs = builder.build_inputs();
        let outputs = inputs.execute();

        let mut reconstructed_tx_effects = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];
        // tx hash
        reconstructed_tx_effects[1] = inputs.tube_data.public_inputs.hash();
        // tx fee
        reconstructed_tx_effects[2] =
            field_from_bytes([TX_FEE_PREFIX, 0].concat(tx_fee.to_be_bytes::<29>()), true);
        // notes
        let mut offset = 3;
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, NUM_NOTES);
        reconstructed_tx_effects[offset] = notes_prefix;
        offset += 1;
        for i in 0..NUM_NOTES {
            reconstructed_tx_effects[offset + i] =
                builder.tube_data.note_hashes.storage()[i].value();
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
                builder.tube_data.l2_to_l1_msgs.get(i).expose_to_public(),
                builder.tube_data.tx_context.version,
                builder.tube_data.tx_context.chain_id,
            );
        }
        offset += NUM_MSGS;
        // Public data writes.
        // 1 public data write is added for paying the fee.
        reconstructed_tx_effects[offset] =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, 1);
        offset += 1;
        let fee_write = builder.get_fee_write();
        reconstructed_tx_effects[offset] = fee_write.slot;
        reconstructed_tx_effects[offset + 1] = fee_write.value;
        offset += 2;
        // private logs
        reconstructed_tx_effects[offset] =
            encode_blob_prefix(PRIVATE_LOGS_PREFIX, NUM_PRIVATE_LOGS);
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
        // cc logs
        let contract_class_logs_prefix =
            encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, NUM_CC_LOGS);
        reconstructed_tx_effects[offset] = contract_class_logs_prefix;
        offset += 1;
        for i in 0..NUM_CC_LOGS {
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
            TX_START_PREFIX.to_be_bytes::<8>().concat([
                0,
                length_bytes[0],
                length_bytes[1],
                0,
                REVERT_CODE_PREFIX,
                0,
                0,
            ]),
            true,
        );

        let mut expected_sponge = outputs.start_sponge_blob;
        expected_sponge.absorb(reconstructed_tx_effects, offset);
        assert(outputs.end_sponge_blob.eq(expected_sponge));
    }

    #[test]
    unconstrained fn empty_block_out_hash() {
        let outputs = PrivateBaseRollupInputsBuilder::new().execute();
        assert_eq(outputs.out_hash, 0);
    }

    #[test]
    unconstrained fn nonempty_block_out_hash() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.tube_data.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);

        let out_hash = builder.execute().out_hash;

        let siloed_l2_to_l1_msgs = builder.tube_data.l2_to_l1_msgs.map(|l2_to_l1_message| silo_l2_to_l1_message(
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
        let mut inputs = PrivateBaseRollupInputsBuilder::new().build_inputs();
        inputs.archive_root_membership_witness.sibling_path[0] = 27;
        let _output = inputs.execute();
    }

    #[test]
    unconstrained fn constants_dont_change() {
        let inputs = PrivateBaseRollupInputsBuilder::new().build_inputs();
        let outputs = inputs.execute();

        assert(inputs.constants.eq(outputs.constants));
    }

    #[test(should_fail_with = "kernel chain_id does not match the rollup chain_id")]
    unconstrained fn constants_dont_match_kernels_chain_id() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.constants.global_variables.chain_id = 3;
        builder.fails();
    }

    #[test(should_fail_with = "kernel version does not match the rollup version")]
    unconstrained fn constants_dont_match_kernels_version() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.constants.global_variables.version += 1;
        builder.fails();
    }

    #[test(should_fail_with = "tx include_by_timestamp is smaller than block timestamp")]
    unconstrained fn constants_dont_satisfy_smaller_include_by_timestamp() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.constants.global_variables.timestamp = 42;
        builder.tube_data.include_by_timestamp = 5;
        builder.fails();
    }

    #[test]
    unconstrained fn constants_satisfy_equal_include_by_timestamp() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.constants.global_variables.timestamp = 42;
        builder.tube_data.include_by_timestamp = 42;
        builder.succeeds();
    }

    #[test]
    unconstrained fn constants_satisfy_larger_include_by_timestamp() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();
        builder.constants.global_variables.timestamp = 42;
        builder.tube_data.include_by_timestamp = 4294967295;
        builder.succeeds();
    }

    #[test]
    unconstrained fn num_txs_is_1() {
        let outputs = PrivateBaseRollupInputsBuilder::new().execute();

        assert_eq(outputs.num_txs, 1);
    }

    #[test(should_fail_with = "Not enough balance for fee payer to pay for transaction")]
    unconstrained fn fails_to_update_fee_payer_balance_if_not_enough_funds() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        builder.set_fee_payer_balance(1);

        builder.fails();
    }

    #[test(should_fail_with = "Wrong leaf slot for Fee Juice balance read hint")]
    unconstrained fn fails_to_update_fee_payer_balance_if_wrong_read_hint() {
        let mut builder = PrivateBaseRollupInputsBuilder::new();

        // Tweak the leaf index for the fee payer's balance.
        builder.fee_payer_balance_leaf_index += 1;

        builder.fails();
    }
}
