use crate::{
    abis::base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
    base::{
        components::{
            archive::perform_archive_membership_check, constants::validate_combined_constant_data,
            nullifier_tree::nullifier_tree_batch_insert, public_data_tree::public_data_tree_insert,
            PublicTubeDataValidator,
        },
        state_diff_hints::PublicBaseStateDiffHints,
    },
    components::{append_tx_effects_for_blob, compute_kernel_out_hash},
};
use dep::types::{
    abis::{
        accumulated_data::{self, CombinedAccumulatedData},
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        avm_circuit_public_inputs::AvmProofData,
        combined_constant_data::CombinedConstantData,
        constant_rollup_data::ConstantRollupData,
        log_hash::ScopedLogHash,
        nullifier_leaf_preimage::NullifierLeafPreimage,
        public_data_write::PublicDataWrite,
        sponge_blob::SpongeBlob,
        tube::PublicTubeData,
    },
    constants::{
        ARCHIVE_HEIGHT, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
    },
    hash::silo_l2_to_l1_message,
    merkle_tree::{
        append_only_tree, calculate_empty_tree_root, calculate_subtree_root, MembershipWitness,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    partial_state_reference::PartialStateReference,
    traits::is_empty,
    utils::arrays::array_merge,
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start: PartialStateReference,
    start_sponge_blob: SpongeBlob,

    state_diff_hints: PublicBaseStateDiffHints,

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    fn generate_combined_accumulated_data(self, reverted: bool) -> CombinedAccumulatedData {
        let from_private = self.tube_data.public_inputs;
        let from_public = self.avm_proof_data.public_inputs;

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
        let contract_class_log_preimages_length =
            contract_class_logs_hashes.fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
        let unencrypted_log_preimages_length = from_public
            .accumulated_data
            .unencrypted_logs_hashes
            .fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);

        CombinedAccumulatedData {
            note_hashes: from_public.accumulated_data.note_hashes,
            nullifiers: from_public.accumulated_data.nullifiers,
            l2_to_l1_msgs: from_public.accumulated_data.l2_to_l1_msgs,
            private_logs,
            unencrypted_logs_hashes: from_public.accumulated_data.unencrypted_logs_hashes,
            contract_class_logs_hashes,
            unencrypted_log_preimages_length,
            contract_class_log_preimages_length,
            public_data_writes: from_public.accumulated_data.public_data_writes,
        }
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

        let combined_accumulated_data = self.generate_combined_accumulated_data(reverted);

        let combined_constant_data = CombinedConstantData::combine(
            self.tube_data.public_inputs.constants,
            self.avm_proof_data.public_inputs.global_variables,
        );
        validate_combined_constant_data(combined_constant_data, self.constants);

        self.validate_kernel_start_state();

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

        let commitments_tree_subroot =
            calculate_subtree_root(combined_accumulated_data.note_hashes);

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
            self.check_nullifier_tree_non_membership_and_insert_to_tree(combined_accumulated_data);

        // Validate public data update requests and update public data tree
        let end_public_data_tree_snapshot =
            self.validate_and_process_public_state(combined_accumulated_data.public_data_writes);

        // Append the tx effects for blob(s)
        let siloed_l2_to_l1_msgs = combined_accumulated_data.l2_to_l1_msgs.map(
            |message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                message,
                combined_constant_data.tx_context.version,
                combined_constant_data.tx_context.chain_id,
            ),
        );
        let out_hash = compute_kernel_out_hash(siloed_l2_to_l1_msgs);

        let revert_code = if reverted { 1 } else { 0 };

        let end_sponge_blob = append_tx_effects_for_blob(
            combined_accumulated_data,
            revert_code,
            self.avm_proof_data.public_inputs.transaction_fee,
            combined_accumulated_data.public_data_writes,
            siloed_l2_to_l1_msgs,
            self.start_sponge_blob,
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
            start: self.start,
            end: PartialStateReference {
                note_hash_tree: end_note_hash_tree_snapshot,
                nullifier_tree: end_nullifier_tree_snapshot,
                public_data_tree: end_public_data_tree_snapshot,
            },
            start_sponge_blob: self.start_sponge_blob,
            end_sponge_blob,
            out_hash,
            accumulated_fees: self.avm_proof_data.public_inputs.transaction_fee,
            accumulated_mana_used: self.avm_proof_data.public_inputs.end_gas_used.l2_gas as Field,
        }
    }

    fn check_nullifier_tree_non_membership_and_insert_to_tree(
        self,
        accumulated_data: CombinedAccumulatedData,
    ) -> AppendOnlyTreeSnapshot {
        nullifier_tree_batch_insert(
            self.start.nullifier_tree,
            accumulated_data.nullifiers,
            self.state_diff_hints.sorted_nullifiers,
            self.state_diff_hints.sorted_nullifier_indexes,
            self.state_diff_hints.nullifier_subtree_sibling_path,
            self.state_diff_hints.nullifier_predecessor_preimages,
            self.state_diff_hints.nullifier_predecessor_membership_witnesses,
        )
    }

    fn create_nullifier_subtree<let N: u32>(leaves: [NullifierLeafPreimage; N]) -> Field {
        calculate_subtree_root(leaves.map(|leaf: NullifierLeafPreimage| leaf.hash()))
    }

    fn validate_kernel_start_state(self) {
        let start_tree_snapshots = self.avm_proof_data.public_inputs.start_tree_snapshots;
        let start_state = PartialStateReference {
            note_hash_tree: start_tree_snapshots.note_hash_tree,
            nullifier_tree: start_tree_snapshots.nullifier_tree,
            public_data_tree: start_tree_snapshots.public_data_tree,
        };
        if !is_empty(start_state) {
            assert(
                start_state.note_hash_tree.eq(self.start.note_hash_tree),
                "Mismatch start state for note hash tree",
            );
            assert(
                start_state.nullifier_tree.eq(self.start.nullifier_tree),
                "Mismatch start state for nullifier tree",
            );
            assert(
                start_state.public_data_tree.eq(self.start.public_data_tree),
                "Mismatch start state for public data tree",
            );
        }
    }

    fn validate_and_process_public_state(
        self,
        all_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    ) -> AppendOnlyTreeSnapshot {
        let mut snapshot = self.start.public_data_tree;
        for i in 0..all_update_requests.len() {
            let update_request = all_update_requests[i];
            snapshot = public_data_tree_insert(
                update_request,
                snapshot,
                self.state_diff_hints.low_public_data_writes_preimages[i],
                self.state_diff_hints.low_public_data_writes_witnesses[i],
                self.state_diff_hints.public_data_tree_sibling_paths[i],
            );
        }
        snapshot
    }
}

mod tests {
    use crate::{
        abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
        base::{
            public_base_rollup::PublicBaseRollupInputs, state_diff_hints::PublicBaseStateDiffHints,
        },
        components::{
            append_tx_effects_for_blob, encode_blob_prefix, TX_EFFECTS_BLOB_HASH_INPUT_FIELDS,
        },
    };
    use dep::types::{
        abis::{
            accumulated_data::CombinedAccumulatedData,
            append_only_tree_snapshot::AppendOnlyTreeSnapshot,
            constant_rollup_data::ConstantRollupData,
            nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
            sponge_blob::SpongeBlob,
        },
        address::EthAddress,
        constants::{
            ARCHIVE_HEIGHT, AVM_VK_INDEX, CONTRACT_CLASS_LOGS_PREFIX, L2_L1_MSGS_PREFIX,
            MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
            MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
            NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_TREE_HEIGHT, NOTES_PREFIX,
            NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_TREE_HEIGHT,
            NULLIFIERS_PREFIX, PRIVATE_KERNEL_EMPTY_INDEX, PRIVATE_LOG_SIZE_IN_FIELDS,
            PRIVATE_LOGS_PREFIX, PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
            REVERT_CODE_PREFIX, TUBE_VK_INDEX, TX_FEE_PREFIX, TX_START_PREFIX,
            UNENCRYPTED_LOGS_PREFIX,
        },
        data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
        hash::silo_l2_to_l1_message,
        merkle_tree::MembershipWitness,
        messaging::l2_to_l1_message::ScopedL2ToL1Message,
        partial_state_reference::PartialStateReference,
        tests::{
            fixture_builder::FixtureBuilder,
            fixtures::{self, merkle_tree::generate_full_sha_tree},
            merkle_tree_utils::NonEmptyMerkleTree,
        },
        traits::{Empty, is_empty},
        utils::{
            arrays::{array_concat, get_sorted_tuple::get_sorted_tuple},
            field::{field_from_bytes, full_field_less_than},
        },
    };

    struct NullifierInsertion {
        existing_index: u32,
        value: Field,
    }

    global MAX_NULLIFIERS_PER_TEST: u32 = 4;
    global AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST: u32 = 128;
    global AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST: u32 = 7;
    global PRE_EXISTING_PUBLIC_DATA_LEAVES: u32 = 10;

    fn update_public_data_tree<let AVAILABLE_LEAVES: u32, let EXISTING_LEAVES: u32, let SUBTREE_SIBLING_PATH_LENGTH: u32, let SUBTREE_HEIGHT: u32>(
        public_data_tree: &mut NonEmptyMerkleTree<AVAILABLE_LEAVES, PUBLIC_DATA_TREE_HEIGHT, SUBTREE_SIBLING_PATH_LENGTH, SUBTREE_HEIGHT>,
        snapshot: AppendOnlyTreeSnapshot,
        writes: [(u32, PublicDataTreeLeaf); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
        mut pre_existing_public_data: [PublicDataTreeLeafPreimage; EXISTING_LEAVES],
    ) -> ([PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX], [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX], [[Field; PUBLIC_DATA_TREE_HEIGHT]; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX]) {
        let mut low_leaves =
            [PublicDataTreeLeafPreimage::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        let mut low_public_data_writes_witnesses =
            [MembershipWitness::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        let mut insertion_witnesses =
            [[0; PUBLIC_DATA_TREE_HEIGHT]; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];

        let mut current_next_leaf_index = snapshot.next_available_leaf_index;

        for i in 0..writes.len() {
            let (low_leaf_index, write) = writes[i];
            if (!is_empty(write)) {
                let low_leaf = pre_existing_public_data[low_leaf_index];
                let mut new_leaf = PublicDataTreeLeafPreimage::empty();
                if low_leaf.slot == write.slot {
                    pre_existing_public_data[low_leaf_index].value = write.value;
                } else {
                    new_leaf = PublicDataTreeLeafPreimage {
                        slot: write.slot,
                        value: write.value,
                        next_slot: low_leaf.next_slot,
                        next_index: low_leaf.next_index,
                    };
                    pre_existing_public_data[low_leaf_index] = PublicDataTreeLeafPreimage {
                        slot: low_leaf.slot,
                        value: low_leaf.value,
                        next_slot: write.slot,
                        next_index: PRE_EXISTING_PUBLIC_DATA_LEAVES + i,
                    };
                }
                let low_public_data_writes_witness = MembershipWitness {
                    leaf_index: low_leaf_index as Field,
                    sibling_path: public_data_tree.get_sibling_path(low_leaf_index),
                };

                public_data_tree.update_leaf(
                    low_leaf_index,
                    pre_existing_public_data[low_leaf_index].hash(),
                );

                let insertion_witness = public_data_tree.get_sibling_path(current_next_leaf_index);

                public_data_tree.update_leaf(current_next_leaf_index, new_leaf.hash());

                low_leaves[i] = low_leaf;
                low_public_data_writes_witnesses[i] = low_public_data_writes_witness;
                insertion_witnesses[i] = insertion_witness;
                current_next_leaf_index += 1;
            }
        }
        (low_leaves, low_public_data_writes_witnesses, insertion_witnesses)
    }

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
            inputs.constants.vk_tree_root = inputs.tube_data.vk_tree_root;

            inputs.pre_existing_blocks[0] = inputs.tube_data.historical_header.hash();

            inputs
        }

        unconstrained fn new_with_previous_kernel(previous_vk_index: u32) -> Self {
            let mut builder = PublicBaseRollupInputsBuilder::new();
            builder.tube_data = builder.tube_data.in_vk_tree(previous_vk_index);
            builder
        }

        fn build_pre_existing_tx_effects(
            self,
        ) -> (CombinedAccumulatedData, [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX]) {
            let mut res = CombinedAccumulatedData::empty();
            res.note_hashes = self.pre_existing_notes;
            res.nullifiers = self.pre_existing_nullifiers.map(|nullifier: NullifierLeafPreimage| {
                nullifier.nullifier
            });
            let all_public_data_update_requests = self.pre_existing_public_data.map(
                |leaf_preimage: PublicDataTreeLeafPreimage| {
                    PublicDataWrite { leaf_slot: leaf_preimage.slot, value: leaf_preimage.value }
                },
            );
            let padded_all_public_data_update_requests = array_concat(
                all_public_data_update_requests,
                [
                    PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
                        - PRE_EXISTING_PUBLIC_DATA_LEAVES
                ],
            );

            (res, padded_all_public_data_update_requests)
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
            start_nullifier_tree_snapshot: AppendOnlyTreeSnapshot,
        ) -> ([NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX], [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX], [Field; MAX_NULLIFIERS_PER_TX], [u32; MAX_NULLIFIERS_PER_TX]) {
            let mut nullifier_predecessor_preimages =
                [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX];
            let mut low_nullifier_membership_witness =
                [MembershipWitness::empty(); MAX_NULLIFIERS_PER_TX];

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

        unconstrained fn build_inputs(mut self) -> PublicBaseRollupInputs {
            let mut tube_data = self.tube_data.to_public_tube_data();
            let mut avm_proof_data = self.avm_data.to_avm_proof_data(self.reverted);

            avm_proof_data.public_inputs.transaction_fee = self.transaction_fee;

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
            let note_hash_subtree_sibling_path = PublicBaseRollupInputsBuilder::extract_subtree_sibling_path(
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

            let (nullifier_predecessor_preimages, nullifier_predecessor_membership_witnesses, sorted_nullifiers, sorted_nullifier_indexes) = self
                .update_nullifier_tree_with_new_leaves(
                    &mut start_nullifier_tree,
                    start_nullifier_tree_snapshot,
                );

            for i in 0..self.nullifiers.len() {
                let nullifier = self.nullifiers.get_unchecked(i);
                avm_proof_data.public_inputs.accumulated_data.nullifiers[i] = nullifier.value;
            }

            let nullifier_subtree_sibling_path = PublicBaseRollupInputsBuilder::extract_subtree_sibling_path(
                start_nullifier_tree.get_sibling_path(self.pre_existing_nullifiers.len()),
                [0; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
            );

            let (low_public_data_writes_preimages, low_public_data_writes_witnesses, public_data_tree_sibling_paths) = update_public_data_tree(
                &mut start_public_data_tree,
                start_public_data_tree_snapshot,
                self.public_data_writes.storage(),
                self.pre_existing_public_data,
            );

            for i in 0..self.public_data_writes.len() {
                let leaf = self.public_data_writes.get_unchecked(i).1;
                avm_proof_data.public_inputs.accumulated_data.public_data_writes[i] =
                    PublicDataWrite { leaf_slot: leaf.slot, value: leaf.value };
            }

            let start = PartialStateReference {
                note_hash_tree: start_note_hash_tree_snapshot,
                nullifier_tree: start_nullifier_tree_snapshot,
                public_data_tree: start_public_data_tree_snapshot,
            };

            let (pre_existing_tx_effects, pre_existing_public_data_update_requests) =
                self.build_pre_existing_tx_effects();

            let start_sponge_blob = append_tx_effects_for_blob(
                pre_existing_tx_effects,
                0,
                0,
                pre_existing_public_data_update_requests,
                [0; MAX_L2_TO_L1_MSGS_PER_TX],
                SpongeBlob::new(TX_EFFECTS_BLOB_HASH_INPUT_FIELDS),
            );

            let state_diff_hints = PublicBaseStateDiffHints {
                nullifier_predecessor_preimages,
                nullifier_predecessor_membership_witnesses,
                sorted_nullifiers,
                sorted_nullifier_indexes,
                note_hash_subtree_sibling_path,
                nullifier_subtree_sibling_path,
                low_public_data_writes_preimages,
                low_public_data_writes_witnesses,
                public_data_tree_sibling_paths,
            };

            PublicBaseRollupInputs {
                tube_data,
                avm_proof_data,
                start,
                start_sponge_blob,
                state_diff_hints,
                archive_root_membership_witness: MembershipWitness {
                    leaf_index: 0,
                    sibling_path: start_archive.get_sibling_path(0),
                },
                constants: self.constants,
            }
        }

        fn execute(self) -> BaseOrMergeRollupPublicInputs {
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
    unconstrained fn note_hashes_tree() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        let note_hashes = [27, 28, 29, 30, 31, 32];
        for i in 0..note_hashes.len() {
            builder.avm_data.add_new_note_hash(note_hashes[i]);
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
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.succeeds();
    }

    #[test]
    unconstrained fn nullifier_insertion_test() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

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
        let mut builder = PublicBaseRollupInputsBuilder::new();

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
        let mut builder = PublicBaseRollupInputsBuilder::new();

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
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 7, next_index: 1 };
        builder.pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 7, next_nullifier: 0, next_index: 0 };

        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });
        builder.nullifiers.push(NullifierInsertion { existing_index: 1, value: 8 });

        builder.fails();
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
        let outputs = builder.execute();
        let mut tx_effects = [0; 53];
        // TODO(#8954): This test uses 50 notes and 3 extra absorbed fields
        // This may change when logs are deconstructed
        // Initial field = TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
        // The first 3 are: i=0 init field, i=1: tx fee, i=2: note prefix
        tx_effects[0] = field_from_bytes(
            array_concat(
                TX_START_PREFIX.to_be_bytes::<8>(),
                [0, 0, tx_effects.len() as u8, 0, REVERT_CODE_PREFIX, 0, 0],
            ),
            true,
        );
        tx_effects[1] = field_from_bytes(
            array_concat([TX_FEE_PREFIX, 0], (0).to_be_bytes::<29>()),
            true,
        );
        tx_effects[2] = encode_blob_prefix(NOTES_PREFIX, 50);
        for i in 0..50 {
            tx_effects[i + 3] = builder.avm_data.note_hashes.storage()[i].value();
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
        let NUM_UNENC_LOGS = 6;
        let NUM_CC_LOGS = 1;
        let PUB_DATA_SLOT = 25;
        let PUB_DATA_VALUE = 60;
        let TOTAL_BLOB_FIELDS = 2 // revert code and tx fee
            + NUM_NOTES
            + 1 // notes and prefix
            + NUM_NULLIFIERS
            + 1 // nullifiers and prefix
            + NUM_MSGS
            + 1 // L2 to L1 msgs and prefix
            + NUM_UNENC_LOGS
            + 1 // unenc. logs and prefix
            + NUM_CC_LOGS
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
        builder.avm_data.append_unencrypted_log_hashes(NUM_UNENC_LOGS);
        // Below will only work with NUM_CC_LOGS=1
        builder.tube_data.add_contract_class_log_hash(1, 2);
        let outputs = builder.execute();

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
        // tx fee
        reconstructed_tx_effects[1] = field_from_bytes(
            array_concat([TX_FEE_PREFIX, 0], tx_fee.to_be_bytes::<29>()),
            true,
        );
        // notes
        let mut offset = 2;
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
        // TODO(#8954): The below will change with log deconstruction
        // unenc logs
        let unencrypted_logs_prefix = encode_blob_prefix(UNENCRYPTED_LOGS_PREFIX, NUM_UNENC_LOGS);
        reconstructed_tx_effects[offset] = unencrypted_logs_prefix;
        offset += 1;
        for i in 0..NUM_UNENC_LOGS {
            reconstructed_tx_effects[offset + i] = types::hash::silo_unencrypted_log_hash(
                builder.avm_data.unencrypted_logs_hashes.storage()[i],
            );
        }
        offset += NUM_UNENC_LOGS;
        // cc logs
        let contract_class_logs_prefix =
            encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, NUM_CC_LOGS);
        reconstructed_tx_effects[offset] = contract_class_logs_prefix;
        offset += 1;
        for i in 0..NUM_CC_LOGS {
            reconstructed_tx_effects[offset + i] = types::hash::silo_unencrypted_log_hash(
                builder.tube_data.contract_class_logs_hashes.storage()[i],
            );
        }
        offset += NUM_CC_LOGS;

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
        builder.tube_data.set_max_block_number(5);
        builder.fails();
    }

    #[test]
    unconstrained fn constants_satisfy_equal_max_block_number() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.block_number = 42;
        builder.tube_data.set_max_block_number(42);
        builder.succeeds();
    }

    #[test]
    unconstrained fn constants_satisfy_larger_max_block_number() {
        let mut builder = PublicBaseRollupInputsBuilder::new();
        builder.constants.global_variables.block_number = 42;
        builder.tube_data.set_max_block_number(4294967295);
        builder.succeeds();
    }

    #[test]
    unconstrained fn num_txs_is_1() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();

        assert_eq(outputs.num_txs, 1);
    }

    #[test]
    unconstrained fn single_public_state_write() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.pre_existing_public_data[0] =
            PublicDataTreeLeafPreimage { slot: 27, value: 28, next_slot: 0, next_index: 0 };
        builder.public_data_writes.push((0, PublicDataTreeLeaf { slot: 27, value: 29 }));
        let outputs = builder.execute();

        let updated_leaf =
            PublicDataTreeLeafPreimage { slot: 27, value: 29, next_slot: 0, next_index: 0 };

        let mut expected_public_data_tree = NonEmptyMerkleTree::new(
            [updated_leaf.hash(), 0],
            [0; PUBLIC_DATA_TREE_HEIGHT],
            [0; PUBLIC_DATA_TREE_HEIGHT - 1],
            [0; 1],
        );

        assert_eq(outputs.end.public_data_tree.root, expected_public_data_tree.get_root());
    }

    #[test]
    unconstrained fn multiple_public_state_read_writes() {
        let mut builder = PublicBaseRollupInputsBuilder::new();

        builder.pre_existing_public_data[0] =
            PublicDataTreeLeafPreimage { slot: 20, value: 40, next_slot: 28, next_index: 1 };
        builder.pre_existing_public_data[1] =
            PublicDataTreeLeafPreimage { slot: 28, value: 41, next_slot: 29, next_index: 2 };
        builder.pre_existing_public_data[2] =
            PublicDataTreeLeafPreimage { slot: 29, value: 42, next_slot: 30, next_index: 3 };
        builder.pre_existing_public_data[3] =
            PublicDataTreeLeafPreimage { slot: 30, value: 43, next_slot: 0, next_index: 0 };
        builder.public_data_writes.push((0, PublicDataTreeLeaf { slot: 25, value: 60 }));
        builder.public_data_writes.push((0, PublicDataTreeLeaf { slot: 20, value: 90 }));

        let outputs = builder.execute();

        let mut public_data_leaves = [0; AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST];
        public_data_leaves[0] = PublicDataTreeLeafPreimage {
            slot: 20,
            value: 90,
            next_slot: 25,
            next_index: PRE_EXISTING_PUBLIC_DATA_LEAVES,
        }
            .hash();
        public_data_leaves[1] =
            PublicDataTreeLeafPreimage { slot: 28, value: 41, next_slot: 29, next_index: 2 }.hash();
        public_data_leaves[2] =
            PublicDataTreeLeafPreimage { slot: 29, value: 42, next_slot: 30, next_index: 3 }.hash();
        public_data_leaves[3] =
            PublicDataTreeLeafPreimage { slot: 30, value: 43, next_slot: 0, next_index: 0 }.hash();
        public_data_leaves[PRE_EXISTING_PUBLIC_DATA_LEAVES] =
            PublicDataTreeLeafPreimage { slot: 25, value: 60, next_slot: 28, next_index: 1 }.hash();

        let mut expected_public_data_tree = NonEmptyMerkleTree::new(
            public_data_leaves,
            [0; PUBLIC_DATA_TREE_HEIGHT],
            [0; PUBLIC_DATA_TREE_HEIGHT - AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST],
            [0; AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST],
        );

        assert_eq(outputs.end.public_data_tree.root, expected_public_data_tree.get_root());
    }

    #[test]
    fn valid_previous_kernel_empty() {
        let builder = unsafe {
            PublicBaseRollupInputsBuilder::new_with_previous_kernel(PRIVATE_KERNEL_EMPTY_INDEX)
        };

        let _res = builder.execute();
    }
}
