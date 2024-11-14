use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
        constant_rollup_data::ConstantRollupData,
    },
    base::{components::private_tube_data::PrivateTubeData, state_diff_hints::StateDiffHints},
    components::{compute_kernel_out_hash, compute_tx_effects_hash},
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        kernel_circuit_public_inputs::KernelCircuitPublicInputs,
        nullifier_leaf_preimage::NullifierLeafPreimage, public_data_write::PublicDataWrite,
    },
    address::AztecAddress,
    constants::{
        ARCHIVE_HEIGHT, FEE_JUICE_ADDRESS, MAX_NOTE_HASHES_PER_TX,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NOTE_HASH_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PRIVATE_KERNEL_EMPTY_INDEX, PUBLIC_DATA_SUBTREE_HEIGHT,
        PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, PUBLIC_DATA_TREE_HEIGHT, TUBE_VK_INDEX,
    },
    data::{
        hash::{compute_public_data_tree_index, compute_public_data_tree_value},
        public_data_hint::PublicDataHint,
        PublicDataTreeLeaf,
        PublicDataTreeLeafPreimage,
    },
    hash::silo_l2_to_l1_message,
    merkle_tree::{
        append_only_tree, assert_check_membership, calculate_empty_tree_root,
        calculate_subtree_root, indexed_tree, MembershipWitness,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    partial_state_reference::PartialStateReference,
    storage::map::derive_storage_slot_in_map,
    traits::is_empty,
    utils::{arrays::find_index_hint, field::{full_field_greater_than, full_field_less_than}},
};

global ALLOWED_PREVIOUS_CIRCUITS = [PRIVATE_KERNEL_EMPTY_INDEX, TUBE_VK_INDEX];

pub struct PrivateBaseRollupInputs {
    tube_data: PrivateTubeData,

    start: PartialStateReference,

    state_diff_hints: StateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

    fee_write_low_leaf_preimage: PublicDataTreeLeafPreimage,
    fee_write_low_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    fee_write_sibling_path: [Field; PUBLIC_DATA_TREE_HEIGHT],

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PrivateBaseRollupInputs {
    fn compute_transaction_fee(self) -> Field {
        let gas_fees = self.constants.global_variables.gas_fees;
        let gas_used = self.tube_data.public_inputs.gas_used;
        gas_used.compute_fee(gas_fees)
    }

    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        if !dep::std::runtime::is_unconstrained() {
            self.tube_data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree(self.tube_data.public_inputs.constants.vk_tree_root, ALLOWED_PREVIOUS_CIRCUITS);
        }

        let transaction_fee = self.compute_transaction_fee();

        // Verify the kernel chain_id and versions
        assert(
            self.tube_data.public_inputs.constants.tx_context.chain_id
                == self.constants.global_variables.chain_id,
            "kernel chain_id does not match the rollup chain_id",
        );
        assert(
            self.tube_data.public_inputs.constants.tx_context.version
                == self.constants.global_variables.version,
            "kernel version does not match the rollup version",
        );
        assert(
            self.tube_data.public_inputs.constants.vk_tree_root == self.constants.vk_tree_root,
            "kernel vk_tree_root does not match the rollup vk_tree_root",
        );
        assert(
            self.tube_data.public_inputs.constants.protocol_contract_tree_root
                == self.constants.protocol_contract_tree_root,
            "kernel protocol_contract_tree_root does not match the rollup protocol_contract_tree_root",
        );

        // Verify the kernel global variables if set, note these can be empty if this is a request coming directly from the private kernel tail.
        // TODO(@spalladino) How can we check that this is a request coming from the private kernel tail?
        assert(
            self.tube_data.public_inputs.constants.global_variables.is_empty()
                | (
                    self.tube_data.public_inputs.constants.global_variables
                        == self.constants.global_variables
                ),
            "kernel global variables do not match the rollup global variables",
        );

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

        // Write fee to public data tree
        let fee_public_data_write = self.build_fee_public_data_write(transaction_fee);
        let end_public_data_tree_snapshot =
            self.insert_fee_public_data_write(fee_public_data_write);
        let mut all_public_data_update_requests =
            [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        all_public_data_update_requests[0] = fee_public_data_write;

        // Calculate the tx effects hash of the transaction
        let siloed_l2_to_l1_msgs = self.tube_data.public_inputs.end.l2_to_l1_msgs.map(
            |message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                message,
                self.tube_data.public_inputs.constants.tx_context.version,
                self.tube_data.public_inputs.constants.tx_context.chain_id,
            ),
        );
        let out_hash = compute_kernel_out_hash(siloed_l2_to_l1_msgs);
        let tx_effects_hash = compute_tx_effects_hash(
            self.tube_data.public_inputs.end,
            self.tube_data.public_inputs.revert_code,
            transaction_fee,
            all_public_data_update_requests,
            out_hash,
        );

        // Perform membership checks that the notes provided exist within the historical trees data
        self.perform_archive_membership_checks();

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
            accumulated_fees: transaction_fee,
        }
    }

    // TODO(Kev): This should say calculate_commitments_subtree_root
    // Cpp code says calculate_commitments_subtree, so I'm leaving it as is for now
    fn calculate_commitments_subtree(self) -> Field {
        calculate_subtree_root(self.tube_data.public_inputs.end.note_hashes)
    }

    fn check_nullifier_tree_non_membership_and_insert_to_tree(self) -> AppendOnlyTreeSnapshot {
        indexed_tree::batch_insert(
            self.start.nullifier_tree,
            self.tube_data.public_inputs.end.nullifiers,
            self.state_diff_hints.sorted_nullifiers,
            self.state_diff_hints.sorted_nullifier_indexes,
            self.state_diff_hints.nullifier_subtree_sibling_path,
            self.state_diff_hints.nullifier_predecessor_preimages,
            self.state_diff_hints.nullifier_predecessor_membership_witnesses.map(
                |witness: MembershipWitness<NULLIFIER_TREE_HEIGHT>| {
                    MembershipWitness {
                        leaf_index: witness.leaf_index,
                        sibling_path: witness.sibling_path,
                    }
                },
            ),
            |low_leaf: NullifierLeafPreimage, nullifier: Field| {
                // Is valid low leaf
                let is_less_than_nullifier = full_field_less_than(low_leaf.nullifier, nullifier);
                let is_next_greater_than = full_field_less_than(nullifier, low_leaf.next_nullifier);

                (!low_leaf.is_empty())
                    & is_less_than_nullifier
                    & (
                        is_next_greater_than
                            | ((low_leaf.next_index == 0) & (low_leaf.next_nullifier == 0))
                    )
            },
            |low_leaf: NullifierLeafPreimage, nullifier: Field, nullifier_index: u32| {
                // Update low leaf
                NullifierLeafPreimage {
                    nullifier: low_leaf.nullifier,
                    next_nullifier: nullifier,
                    next_index: nullifier_index,
                }
            },
            |nullifier: Field, low_leaf: NullifierLeafPreimage| {
                // Build insertion leaf
                NullifierLeafPreimage {
                    nullifier: nullifier,
                    next_nullifier: low_leaf.next_nullifier,
                    next_index: low_leaf.next_index,
                }
            },
            [0; NULLIFIER_SUBTREE_HEIGHT],
            [0; NULLIFIER_TREE_HEIGHT],
        )
    }

    fn create_nullifier_subtree<let N: u32>(leaves: [NullifierLeafPreimage; N]) -> Field {
        calculate_subtree_root(leaves.map(|leaf: NullifierLeafPreimage| leaf.hash()))
    }

    fn validate_kernel_start_state(self) {
        let kernel_state = self.tube_data.public_inputs.start_state;
        if !is_empty(kernel_state) {
            assert(
                kernel_state.note_hash_tree.eq(self.start.note_hash_tree),
                "Mismatch start state for note hash tree",
            );
            assert(
                kernel_state.nullifier_tree.eq(self.start.nullifier_tree),
                "Mismatch start state for nullifier tree",
            );
            assert(
                kernel_state.public_data_tree.eq(self.start.public_data_tree),
                "Mismatch start state for public data tree",
            );
        }
    }

    fn build_fee_public_data_write(self, tx_fee: Field) -> PublicDataWrite {
        let fee_payer = self.tube_data.public_inputs.fee_payer;

        let read_hint = self.fee_payer_fee_juice_balance_read_hint;
        let leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);

        // Otherwise, build a new one to be inserted into the protocol update requests at the end of the array.
        read_hint.validate(self.start.public_data_tree.root);

        let balance = read_hint.value;
        assert(read_hint.leaf_slot == leaf_slot, "Wrong leaf slot for Fee Juice balance read hint");
        assert(!balance.lt(tx_fee), "Not enough balance for fee payer to pay for transaction");

        let value = compute_public_data_tree_value(balance - tx_fee);
        PublicDataWrite { leaf_slot, value }
    }

    fn insert_fee_public_data_write(self, fee_write: PublicDataWrite) -> AppendOnlyTreeSnapshot {
        indexed_tree::insert::<_, _, PUBLIC_DATA_TREE_HEIGHT>(
            self.start.public_data_tree,
            PublicDataTreeLeaf { slot: fee_write.leaf_slot, value: fee_write.value },
            self.fee_write_low_leaf_preimage,
            self.fee_write_low_leaf_membership_witness,
            self.fee_write_sibling_path,
            |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf| {
                // Is valid low preimage
                let is_update = low_preimage.slot == write.slot;
                let is_low_empty = low_preimage.is_empty();

                let is_less_than_slot = full_field_less_than(low_preimage.slot, write.slot);
                let is_next_greater_than = full_field_less_than(write.slot, low_preimage.next_slot);
                let is_in_range = is_less_than_slot
                    & (
                        is_next_greater_than
                            | ((low_preimage.next_index == 0) & (low_preimage.next_slot == 0))
                    );

                (!is_low_empty) & (is_update | is_in_range)
            },
            |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf, write_index: u32| {
                // Update low leaf
                let is_update = low_preimage.slot == write.slot;
                if is_update {
                    PublicDataTreeLeafPreimage {
                        slot: low_preimage.slot,
                        value: write.value,
                        next_slot: low_preimage.next_slot,
                        next_index: low_preimage.next_index,
                    }
                } else {
                    PublicDataTreeLeafPreimage {
                        slot: low_preimage.slot,
                        value: low_preimage.value,
                        next_slot: write.slot,
                        next_index: write_index,
                    }
                }
            },
            |write: PublicDataTreeLeaf, low_preimage: PublicDataTreeLeafPreimage| {
                // Build insertion leaf
                let is_update = low_preimage.slot == write.slot;
                if is_update {
                    PublicDataTreeLeafPreimage::empty()
                } else {
                    PublicDataTreeLeafPreimage {
                        slot: write.slot,
                        value: write.value,
                        next_slot: low_preimage.next_slot,
                        next_index: low_preimage.next_index,
                    }
                }
            },
        )
    }

    // Check that the block header used by each kernel is a member of the blocks tree --> since the block header
    // contains roots of all the trees this is sufficient to verify that the tree roots used by kernels are correct
    fn perform_archive_membership_checks(self) {
        // For each of the block header (their block hashes), we need to do an inclusion proof
        // against the blocks tree root from the beginning of a rollup provided in the rollup constants
        let archive_root = self.constants.last_archive.root;

        // Rebuild the block hash
        let header = self.tube_data.public_inputs.constants.historical_header;
        let previous_block_hash = header.hash();

        let previous_block_hash_witness = self.archive_root_membership_witness;

        // Now check that the previous block hash is in the blocks tree from the beginning of the rollup
        assert_check_membership(
            previous_block_hash,
            previous_block_hash_witness.leaf_index,
            previous_block_hash_witness.sibling_path,
            archive_root,
        );
    }
}

fn compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer: AztecAddress) -> Field {
    let balances_slot_in_fee_juice_contract = 1;
    let fee_payer_balance_slot_in_fee_juice_contract =
        derive_storage_slot_in_map(balances_slot_in_fee_juice_contract, fee_payer);
    compute_public_data_tree_index(
        FEE_JUICE_ADDRESS,
        fee_payer_balance_slot_in_fee_juice_contract,
    )
}
