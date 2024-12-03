use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
        constant_rollup_data::ConstantRollupData,
    },
    base::{
        components::{
            archive::perform_archive_membership_check, constants::validate_combined_constant_data,
            fees::compute_fee_payer_fee_juice_balance_leaf_slot,
            nullifier_tree::nullifier_tree_batch_insert, public_data_tree::public_data_tree_insert,
        },
        state_diff_hints::PublicBaseStateDiffHints,
    },
    components::{compute_kernel_out_hash, compute_tx_effects_hash},
};
use dep::types::{
    abis::{
        accumulated_data::CombinedAccumulatedData,
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, avm_circuit_public_inputs::AvmProofData,
        combined_constant_data::CombinedConstantData, log_hash::ScopedLogHash,
        nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
        tube::PublicTubeData,
    },
    constants::{
        ARCHIVE_HEIGHT, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
    },
    data::{hash::compute_public_data_tree_value, public_data_hint::PublicDataHint},
    hash::silo_l2_to_l1_message,
    merkle_tree::{
        append_only_tree, calculate_empty_tree_root, calculate_subtree_root, MembershipWitness,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    partial_state_reference::PartialStateReference,
    traits::is_empty,
    utils::arrays::{array_merge, find_index_hint},
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start: PartialStateReference,

    state_diff_hints: PublicBaseStateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

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
        if !dep::std::runtime::is_unconstrained() {
            self.tube_data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree([TUBE_VK_INDEX]);
        }

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

        // Inject protocol update requests for deducting tx_fee from fee_payer's balance
        let all_public_data_update_requests = self.calculate_all_public_data_update_requests(
            self.avm_proof_data.public_inputs.transaction_fee,
            combined_accumulated_data,
        );

        // Validate public data update requests and update public data tree
        let end_public_data_tree_snapshot =
            self.validate_and_process_public_state(all_public_data_update_requests);

        // Calculate the tx effects hash of the transaction
        let siloed_l2_to_l1_msgs = combined_accumulated_data.l2_to_l1_msgs.map(
            |message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                message,
                combined_constant_data.tx_context.version,
                combined_constant_data.tx_context.chain_id,
            ),
        );
        let out_hash = compute_kernel_out_hash(siloed_l2_to_l1_msgs);

        let revert_code = if reverted { 1 } else { 0 };

        let tx_effects_hash = compute_tx_effects_hash(
            combined_accumulated_data,
            revert_code,
            self.avm_proof_data.public_inputs.transaction_fee,
            all_public_data_update_requests,
            out_hash,
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
            txs_effects_hash: tx_effects_hash,
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

    // Returns an array with all public data update requests for this tx. This includes all update requests
    // generated by app circuits, plus the protocol update requests injected by this circuit. The only protocol
    // update request we have at the time of this writing is deducting the tx_fee from the fee_payer balance.
    fn calculate_all_public_data_update_requests(
        self,
        tx_fee: Field,
        accumulated_data: CombinedAccumulatedData,
    ) -> [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] {
        let mut all_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] =
            [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            all_update_requests[i] = accumulated_data.public_data_writes[i];
        }

        let (payment_update_request, payment_update_index) =
            self.build_or_patch_payment_update_request(tx_fee, accumulated_data);
        all_update_requests[payment_update_index] = payment_update_request;

        all_update_requests
    }

    // Deducts the tx_fee from the FeeJuice balance of the fee_payer. If there is already a PublicDataWrite
    // in this tx for their balance (because they issued a 'claim' to increase their balance by bridging from L1),
    // update it by subtracting the tx_fee. Otherwise, build a new PublicDataWrite to subtract the tx_fee
    // from the balance of the fee_payer, using the fee_payer_fee_juice_balance_read_hint to read the current balance.
    // Returns the data update request that subtracts the tx_fee from the fee_payer's balance, and the index where it
    // should be inserted in the public data update requests array.
    fn build_or_patch_payment_update_request(
        self,
        tx_fee: Field,
        accumulated_data: CombinedAccumulatedData,
    ) -> (PublicDataWrite, u32) {
        let fee_payer = self.tube_data.public_inputs.fee_payer;

        // TODO(@spalladino) Eventually remove the is_zero condition as we should always charge fees to every tx
        if !fee_payer.is_zero() {
            let read_hint = self.fee_payer_fee_juice_balance_read_hint;
            let leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
            let existing_update_index = unsafe {
                find_index_hint(
                    accumulated_data.public_data_writes,
                    |w: PublicDataWrite| w.leaf_slot == leaf_slot,
                )
            };

            if existing_update_index != MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
                // Is there a balance update already in this tx? If so, update it and return its index.
                let existing_update = accumulated_data.public_data_writes[existing_update_index];
                assert(
                    existing_update.leaf_slot == leaf_slot,
                    "Wrong leaf slot for Fee Juice balance update request",
                );
                assert(
                    !existing_update.value.lt(tx_fee),
                    "Not enough balance for fee payer after claim to pay for transaction",
                );

                let value = compute_public_data_tree_value(existing_update.value - tx_fee);
                let protocol_update_request = PublicDataWrite { leaf_slot, value };
                (protocol_update_request, existing_update_index as u32)
            } else {
                // Otherwise, build a new one to be inserted into the protocol update requests at the end of the array.
                read_hint.validate(self.start.public_data_tree.root);

                let balance = read_hint.value;
                assert(
                    read_hint.leaf_slot == leaf_slot,
                    "Wrong leaf slot for Fee Juice balance read hint",
                );
                assert(
                    !balance.lt(tx_fee),
                    "Not enough balance for fee payer to pay for transaction",
                );

                let value = compute_public_data_tree_value(balance - tx_fee);
                let protocol_update_request = PublicDataWrite { leaf_slot, value };
                (protocol_update_request, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
            }
        } else {
            // Nothing to do, just place an empty update request at the end of the array
            (PublicDataWrite::empty(), MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
        }
    }
}

mod tests {
    use crate::{
        abis::{
            base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
            constant_rollup_data::ConstantRollupData,
        },
        base::{
            components::fees::compute_fee_payer_fee_juice_balance_leaf_slot,
            public_base_rollup::PublicBaseRollupInputs, state_diff_hints::PublicBaseStateDiffHints,
        },
        components::TX_EFFECTS_HASH_INPUT_FIELDS,
    };
    use dep::types::{
        abis::{
            append_only_tree_snapshot::AppendOnlyTreeSnapshot,
            nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
        },
        address::{AztecAddress, EthAddress},
        constants::{
            ARCHIVE_HEIGHT, AVM_VK_INDEX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
            MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
            NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT,
            NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_TREE_HEIGHT,
            PRIVATE_KERNEL_EMPTY_INDEX, PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            PUBLIC_DATA_TREE_HEIGHT, TUBE_VK_INDEX,
        },
        data::{public_data_hint::PublicDataHint, PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
        hash::silo_l2_to_l1_message,
        merkle_tree::MembershipWitness,
        messaging::l2_to_l1_message::ScopedL2ToL1Message,
        partial_state_reference::PartialStateReference,
        tests::{fixture_builder::FixtureBuilder, fixtures, merkle_tree_utils::NonEmptyMerkleTree},
        traits::{Empty, is_empty},
        utils::{
            arrays::get_sorted_tuple::get_sorted_tuple,
            field::{field_from_bytes_32_trunc, full_field_less_than},
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
        // Public data writes generated by app code
        public_data_writes: BoundedVec<(u32, PublicDataTreeLeaf), MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
        // Public data writes overwritten by the base rollup circuit
        overwritten_public_data_writes: [Option<PublicDataTreeLeaf>; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
        // New public data writes to be created by the protocol (eg a data update request for updating fee payer balance)
        protocol_public_data_writes: BoundedVec<(u32, PublicDataTreeLeaf), PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
        nullifiers: BoundedVec<NullifierInsertion, MAX_NULLIFIERS_PER_TEST>,
        constants: ConstantRollupData,
        // Index of the item in the pre_existing_public_data array that contains the fee payer's Fee Juice balance.
        // Used for building the public data hint read for the payment update request. If set to none, no hint is built.
        fee_payer_fee_juice_balance_pre_existing_public_data_index: Option<u32>,
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

        fn build_fee_payer_fee_juice_balance_read_hint(
            self,
            start_public_data_tree: NonEmptyMerkleTree<AVAILABLE_PUBLIC_DATA_LEAVES_FOR_TEST, PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT - AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST, AVAILABLE_PUBLIC_DATA_SUBTREE_HEIGHT_FOR_TEST>,
        ) -> PublicDataHint {
            self.fee_payer_fee_juice_balance_pre_existing_public_data_index.map_or(
                PublicDataHint::empty(),
                |leaf_index_u32: u32| {
                    let leaf_index = leaf_index_u32 as Field;
                    let leaf_preimage = self.pre_existing_public_data[leaf_index];
                    let membership_witness = MembershipWitness {
                        leaf_index,
                        sibling_path: start_public_data_tree.get_sibling_path(leaf_index_u32),
                    };
                    PublicDataHint {
                        leaf_slot: leaf_preimage.slot,
                        value: leaf_preimage.value,
                        membership_witness,
                        leaf_preimage,
                    }
                },
            )
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
                    self.nullifiers.storage.map(|insertion: NullifierInsertion| insertion.value),
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

            let fee_payer_fee_juice_balance_read_hint =
                self.build_fee_payer_fee_juice_balance_read_hint(start_public_data_tree);

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

            let mut final_public_data_writes: BoundedVec<(u32, PublicDataTreeLeaf), MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> =
                BoundedVec::new();
            final_public_data_writes.extend_from_array(self.public_data_writes.storage);
            final_public_data_writes.extend_from_array(self.protocol_public_data_writes.storage);
            for i in 0..self.overwritten_public_data_writes.len() {
                if self.overwritten_public_data_writes[i].is_some() {
                    final_public_data_writes.set(
                        i,
                        (
                            final_public_data_writes.get(i).0,
                            self.overwritten_public_data_writes[i].unwrap_unchecked(),
                        ),
                    );
                }
            }

            let (low_public_data_writes_preimages, low_public_data_writes_witnesses, public_data_tree_sibling_paths) = update_public_data_tree(
                &mut start_public_data_tree,
                start_public_data_tree_snapshot,
                final_public_data_writes.storage(),
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
                state_diff_hints,
                archive_root_membership_witness: MembershipWitness {
                    leaf_index: 0,
                    sibling_path: start_archive.get_sibling_path(0),
                },
                constants: self.constants,
                fee_payer_fee_juice_balance_read_hint,
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
                overwritten_public_data_writes: [
                    Option::none(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
                ],
                protocol_public_data_writes: BoundedVec::new(),
                nullifiers: BoundedVec::new(),
                constants: ConstantRollupData::empty(),
                fee_payer_fee_juice_balance_pre_existing_public_data_index: Option::none(),
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
    unconstrained fn empty_tx_effects_hash() {
        let outputs = PublicBaseRollupInputsBuilder::new().execute();

        let hash_input_flattened = [0; TX_EFFECTS_HASH_INPUT_FIELDS * 32];
        let sha_digest = std::hash::sha256(hash_input_flattened);
        let expected_tx_effects_hash = field_from_bytes_32_trunc(sha_digest);
        assert_eq(outputs.txs_effects_hash, expected_tx_effects_hash);
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
        let expected_tree = dep::types::merkle_tree::variable_merkle_tree::tests::generate_full_sha_tree(
            siloed_l2_to_l1_msgs.storage(),
        );
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
    unconstrained fn updates_fee_payer_balance_with_new_data_write() {
        let fee_payer = AztecAddress::from_field(0x1234);
        let balance_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        let initial_balance = 300_000;
        let tx_fee = 100_000;
        let expected_balance = 200_000;

        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Set fee payer
        builder.tube_data.fee_payer = fee_payer;

        // Set pre-existing balance
        builder.pre_existing_public_data[0] = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: initial_balance,
            next_slot: 0,
            next_index: 0,
        };
        builder.fee_payer_fee_juice_balance_pre_existing_public_data_index = Option::some(0);

        // Set values for computing exact tx_fee
        builder.transaction_fee = tx_fee;

        // Set expected protocol data update
        builder.protocol_public_data_writes.push((
            0, PublicDataTreeLeaf { slot: balance_slot, value: expected_balance },
        ));

        let outputs = builder.execute();

        // The new public data tree should have updated the balance of the fee payer
        let updated_leaf = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: expected_balance,
            next_slot: 0,
            next_index: 0,
        };
        let mut expected_public_data_tree = NonEmptyMerkleTree::new(
            [updated_leaf.hash(), 0],
            [0; PUBLIC_DATA_TREE_HEIGHT],
            [0; PUBLIC_DATA_TREE_HEIGHT - 1],
            [0; 1],
        );

        assert_eq(outputs.end.public_data_tree.root, expected_public_data_tree.get_root());
    }

    #[test]
    unconstrained fn updates_fee_payer_balance_in_existing_data_write() {
        let fee_payer = AztecAddress::from_field(0x1234);
        let balance_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        let initial_balance = 100_000;
        let after_claim_balance = 300_000;
        let tx_fee = 100_000;
        let expected_balance = 200_000;

        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Set fee payer
        builder.tube_data.fee_payer = fee_payer;

        // Set pre-existing balance, but set no hint for it since we'll update a user update request
        builder.pre_existing_public_data[0] = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: initial_balance,
            next_slot: 0,
            next_index: 0,
        };

        // Set values for computing exact tx_fee
        builder.transaction_fee = tx_fee;

        // Rollup will overwrite the public data write we are about to push
        builder.overwritten_public_data_writes[builder.public_data_writes.len()] = Option::some(
            PublicDataTreeLeaf { slot: balance_slot, value: expected_balance },
        );

        // Create an existing data update that corresponds to a claim
        builder.public_data_writes.push((
            0, PublicDataTreeLeaf { slot: balance_slot, value: after_claim_balance },
        ));

        let outputs = builder.execute();

        // The new public data tree should have updated the balance of the fee payer
        let updated_leaf = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: expected_balance,
            next_slot: 0,
            next_index: 0,
        };
        let mut expected_public_data_tree = NonEmptyMerkleTree::new(
            [updated_leaf.hash(), 0],
            [0; PUBLIC_DATA_TREE_HEIGHT],
            [0; PUBLIC_DATA_TREE_HEIGHT - 1],
            [0; 1],
        );

        assert_eq(outputs.end.public_data_tree.root, expected_public_data_tree.get_root());
    }

    #[test(should_fail_with = "Not enough balance for fee payer to pay for transaction")]
    unconstrained fn fails_to_update_fee_payer_balance_if_not_enough_funds() {
        let fee_payer = AztecAddress::from_field(0x1234);
        let balance_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        // Set low initial balance so it fails!
        let initial_balance = 10_000;
        let tx_fee = 100_000;

        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Set fee payer
        builder.tube_data.fee_payer = fee_payer;

        // Set pre-existing balance
        builder.pre_existing_public_data[0] = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: initial_balance,
            next_slot: 0,
            next_index: 0,
        };
        builder.fee_payer_fee_juice_balance_pre_existing_public_data_index = Option::some(0);

        // Set values for computing exact tx_fee
        builder.transaction_fee = tx_fee;

        // Set expected protocol data update
        builder.protocol_public_data_writes.push((
            0, PublicDataTreeLeaf { slot: balance_slot, value: -90_000 },
        ));

        builder.fails();
    }

    #[test(should_fail_with = "Wrong leaf slot for Fee Juice balance read hint")]
    unconstrained fn fails_to_update_fee_payer_balance_if_wrong_read_hint() {
        let fee_payer = AztecAddress::from_field(0x1234);
        let balance_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        let initial_balance = 300_000;
        let expected_balance = 200_000;
        let tx_fee = 100_000;

        let mut builder = PublicBaseRollupInputsBuilder::new();

        // Set fee payer
        builder.tube_data.fee_payer = fee_payer;

        // Set pre-existing balance in index 0
        builder.pre_existing_public_data[0] = PublicDataTreeLeafPreimage {
            slot: balance_slot,
            value: initial_balance,
            next_slot: 0,
            next_index: 0,
        };

        builder.pre_existing_public_data[1] = PublicDataTreeLeafPreimage {
            slot: 1,
            value: initial_balance,
            next_slot: balance_slot,
            next_index: 0,
        };

        // But point the read hint to the wrong one!
        builder.fee_payer_fee_juice_balance_pre_existing_public_data_index = Option::some(1);

        // Set values for computing exact tx_fee
        builder.transaction_fee = tx_fee;

        // Set expected protocol data update
        builder.protocol_public_data_writes.push((
            0, PublicDataTreeLeaf { slot: balance_slot, value: expected_balance },
        ));

        builder.fails();
    }

    #[test]
    fn valid_previous_kernel_empty() {
        let builder = unsafe {
            PublicBaseRollupInputsBuilder::new_with_previous_kernel(PRIVATE_KERNEL_EMPTY_INDEX)
        };

        let _res = builder.execute();
    }
}
