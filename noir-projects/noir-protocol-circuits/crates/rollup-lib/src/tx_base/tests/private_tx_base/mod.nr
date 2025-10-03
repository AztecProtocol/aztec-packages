mod child_proof_vk_tests;
mod fee_tests;
mod end_blob_sponge_tests;
mod end_tree_snapshot_tests;
mod out_hash_tests;
mod validate_private_tail_tests;

use crate::{
    abis::TxRollupPublicInputs,
    tests::RollupFixtureBuilder,
    tx_base::{
        components::{
            fees::{compute_fee_payer_fee_juice_balance_leaf_slot, compute_transaction_fee},
            TreeSnapshotDiffHints,
        },
        private_tx_base_rollup_private_inputs::PrivateTxBaseRollupPrivateInputs,
    },
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
        gas::Gas, gas_fees::GasFees,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        nullifier_leaf_preimage::NullifierLeafPreimage,
        partial_state_reference::PartialStateReference, sponge_blob::SpongeBlob,
    },
    address::AztecAddress,
    constants::{
        ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
        NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PUBLIC_DATA_TREE_HEIGHT,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    hash::silo_l2_to_l1_message,
    merkle_tree::{LeafPreimage, MembershipWitness},
    tests::{
        fixture_builder::FixtureBuilder, merkle_tree_utils::SingleSubtreeMerkleTree, utils::pad_end,
    },
    traits::FromField,
    utils::arrays::{find_first_index, get_sorted_tuple, subarray},
};

// The circuit updates an existing leaf in the public data tree, so we only need to build the tree with a subtree big
// enough for all non-empty leaves for the tests.
global TEST_PUBLIC_DATA_SUBTREE_HEIGHT: u32 = 2;
global TEST_PUBLIC_DATA_SUBTREE_WIDTH: u32 = 1 << TEST_PUBLIC_DATA_SUBTREE_HEIGHT;

pub struct TestBuilder {
    private_tail: PrivateToRollupKernelCircuitPublicInputs,
    hiding_kernel_vk_index: u32,
    constants: BlockConstantData,
    start_sponge_blob: SpongeBlob,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    start_tree_snapshots: PartialStateReference,
    tree_snapshot_diff_hints: TreeSnapshotDiffHints,
    pre_existing_note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    note_hash_tree: SingleSubtreeMerkleTree<MAX_NOTE_HASHES_PER_TX, NOTE_HASH_SUBTREE_HEIGHT, NOTE_HASH_TREE_HEIGHT>,
    pre_existing_nullifiers: [NullifierLeafPreimage; 4],
    nullifier_tree: SingleSubtreeMerkleTree<MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT>,
    pre_existing_public_data_preimages: [PublicDataTreeLeafPreimage; TEST_PUBLIC_DATA_SUBTREE_WIDTH],
    fee_payer_preimage_index: u32,
    public_data_tree: SingleSubtreeMerkleTree<TEST_PUBLIC_DATA_SUBTREE_WIDTH, TEST_PUBLIC_DATA_SUBTREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT>,
}

impl TestBuilder {
    pub fn new() -> Self {
        let rollup_fixture_builder = RollupFixtureBuilder::new();
        let block_number = rollup_fixture_builder.start_block_number;

        let start_sponge_blob = rollup_fixture_builder.get_sponge_blob(block_number);

        let mut constants = rollup_fixture_builder.get_block_constant_data(block_number);

        let mut private_tail =
            FixtureBuilder::new().to_private_to_rollup_kernel_circuit_public_inputs();

        private_tail.constants = rollup_fixture_builder.get_tx_constant_data();

        // Set fee-related data.
        let fee_payer = AztecAddress::from_field(33445566);
        private_tail.fee_payer = fee_payer;
        private_tail.gas_used = Gas::new(7, 11);

        let gas_fees = GasFees { fee_per_da_gas: 1, fee_per_l2_gas: 2 };
        constants.global_variables.gas_fees = gas_fees;
        private_tail.constants.tx_context.gas_settings.max_fees_per_gas = gas_fees;

        // Build archive tree.
        let (last_archive, anchor_block_archive_sibling_path) =
            rollup_fixture_builder.build_archive_tree(block_number);

        constants.last_archive = last_archive;

        // Note hashes in the tree before the tx.
        let pre_existing_note_hashes = [121, 343, 565];

        // Public data writes in the tree before the tx.
        let fee_payer_balance_leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        let pre_existing_public_data_preimages = [
            PublicDataTreeLeafPreimage {
                slot: fee_payer_balance_leaf_slot + 10,
                value: 1100,
                next_slot: fee_payer_balance_leaf_slot + 20,
                next_index: 2,
            },
            PublicDataTreeLeafPreimage {
                slot: fee_payer_balance_leaf_slot,
                value: 999, // Balance of the fee payer.
                next_slot: fee_payer_balance_leaf_slot + 10,
                next_index: 0,
            },
            PublicDataTreeLeafPreimage {
                slot: fee_payer_balance_leaf_slot + 20,
                value: 2200,
                next_slot: 0,
                next_index: 0,
            },
            PublicDataTreeLeafPreimage {
                slot: fee_payer_balance_leaf_slot - 10,
                value: 3300,
                next_slot: fee_payer_balance_leaf_slot,
                next_index: 1,
            },
        ];
        let fee_payer_preimage_index = 1;

        // Nullifiers in the tree before the tx.
        let pre_existing_nullifiers = [
            NullifierLeafPreimage { nullifier: 22, next_nullifier: 33, next_index: 3 },
            NullifierLeafPreimage { nullifier: 44, next_nullifier: 0, next_index: 0 },
            NullifierLeafPreimage { nullifier: 11, next_nullifier: 22, next_index: 0 },
            NullifierLeafPreimage { nullifier: 33, next_nullifier: 44, next_index: 1 },
        ];

        let mut builder = TestBuilder {
            private_tail,
            hiding_kernel_vk_index: HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
            constants,
            contract_class_log_fields: pad_end([]),
            start_sponge_blob,
            anchor_block_archive_sibling_path,
            start_tree_snapshots: std::mem::zeroed(),
            tree_snapshot_diff_hints: std::mem::zeroed(),
            pre_existing_note_hashes: pad_end(pre_existing_note_hashes),
            note_hash_tree: std::mem::zeroed(),
            pre_existing_public_data_preimages,
            nullifier_tree: std::mem::zeroed(),
            pre_existing_nullifiers,
            fee_payer_preimage_index,
            public_data_tree: std::mem::zeroed(),
        };

        // Insert the pre-existing note hashes at a random non-zero index by default.
        let note_hash_start_index = (MAX_NOTE_HASHES_PER_TX * 26) as Field;
        builder.build_note_hash_tree(note_hash_start_index);
        // Insert the pre-existing nullifiers at index 0 by default.
        builder.build_nullifier_tree(0);
        builder.build_hints_for_new_nullifiers();
        // Insert the pre-existing public data leaves at index 0.
        builder.build_public_data_tree(0);
        builder.build_hints_for_fee_payer_balance();

        builder
    }

    pub fn get_transaction_fee(self) -> Field {
        compute_transaction_fee(
            self.constants.global_variables.gas_fees,
            self.private_tail.constants.tx_context.gas_settings,
            self.private_tail.gas_used,
        )
    }

    pub fn get_siloed_l2_to_l1_msgs(self) -> [Field; MAX_L2_TO_L1_MSGS_PER_TX] {
        self.private_tail.end.l2_to_l1_msgs.map(|msg| silo_l2_to_l1_message(
            msg,
            self.constants.global_variables.version,
            self.constants.global_variables.chain_id,
        ))
    }

    pub fn update_private_tail_accumulated_data(&mut self, fixture_builder: FixtureBuilder) {
        self.private_tail.end = fixture_builder.to_private_to_rollup_accumulated_data();
        self.contract_class_log_fields = fixture_builder.contract_class_log_fields.storage();
    }

    pub fn build_note_hash_tree(&mut self, start_index: Field) {
        self.note_hash_tree = SingleSubtreeMerkleTree::new_at_index(
            pad_end(self.pre_existing_note_hashes),
            start_index,
        );

        let next_available_leaf_index = start_index + MAX_NOTE_HASHES_PER_TX as Field;

        self.start_tree_snapshots.note_hash_tree = AppendOnlyTreeSnapshot {
            root: self.note_hash_tree.get_root(),
            next_available_leaf_index,
        };

        self.tree_snapshot_diff_hints.note_hash_subtree_root_sibling_path = subarray(
            self.note_hash_tree.get_sibling_path(next_available_leaf_index),
            NOTE_HASH_SUBTREE_HEIGHT,
        );
    }

    pub fn build_nullifier_tree(&mut self, start_index: Field) {
        let leaf_values = self.pre_existing_nullifiers.map(|nullifier| nullifier.as_leaf());
        self.nullifier_tree =
            SingleSubtreeMerkleTree::new_at_index(pad_end(leaf_values), start_index);

        self.start_tree_snapshots.nullifier_tree = AppendOnlyTreeSnapshot {
            root: self.nullifier_tree.get_root(),
            next_available_leaf_index: start_index + MAX_NULLIFIERS_PER_TX as Field,
        };

        // If the tree is rebuilt, might need to call `build_hints_for_new_nullifiers` again to update the hints.
    }

    pub fn build_hints_for_new_nullifiers(&mut self) {
        let new_nullifiers = self.private_tail.end.nullifiers;

        // Safety: This is for testing only.
        let sorted_tuples = unsafe { get_sorted_tuple(new_nullifiers, |a, b| b.lt(a)) };
        let sorted_nullifiers = sorted_tuples.map(|tuple| tuple.elem);
        let sorted_nullifier_indexes = sorted_tuples.map(|tuple| tuple.original_index);
        self.tree_snapshot_diff_hints.sorted_nullifiers = sorted_nullifiers;
        self.tree_snapshot_diff_hints.sorted_nullifier_indexes = sorted_nullifier_indexes;

        let mut cloned_nullifier_tree = self.nullifier_tree;
        let mut low_leaves = self.pre_existing_nullifiers;
        let new_batch_start_index =
            self.start_tree_snapshots.nullifier_tree.next_available_leaf_index;
        for i in 0..sorted_nullifiers.len() {
            let new_nullifier = sorted_nullifiers[i];
            // Safety: This is for testing only.
            let low_leaf_index = unsafe {
                find_first_index(
                    low_leaves,
                    |leaf| {
                        leaf.nullifier.lt(new_nullifier)
                            & (new_nullifier.lt(leaf.next_nullifier) | (leaf.next_nullifier == 0))
                    },
                )
            };
            if low_leaf_index != low_leaves.len() {
                self.tree_snapshot_diff_hints.nullifier_predecessor_preimages[i] =
                    low_leaves[low_leaf_index];

                let low_tree_leaf_index = low_leaf_index as Field;
                self.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[i] = MembershipWitness {
                    leaf_index: low_tree_leaf_index,
                    sibling_path: cloned_nullifier_tree.get_sibling_path(low_tree_leaf_index),
                };

                low_leaves[low_leaf_index].next_nullifier = new_nullifier;
                low_leaves[low_leaf_index].next_index =
                    new_batch_start_index + sorted_nullifier_indexes[i] as Field;

                cloned_nullifier_tree.update_leaf(
                    low_tree_leaf_index,
                    low_leaves[low_leaf_index].as_leaf(),
                );
            }
        }

        self.tree_snapshot_diff_hints.nullifier_subtree_root_sibling_path = subarray(
            cloned_nullifier_tree.get_sibling_path(new_batch_start_index),
            NULLIFIER_SUBTREE_HEIGHT,
        );
    }

    pub fn build_public_data_tree(&mut self, start_index: Field) {
        self.public_data_tree = SingleSubtreeMerkleTree::new_at_index(
            self.pre_existing_public_data_preimages.map(|leaf| leaf.as_leaf()),
            start_index,
        );

        self.start_tree_snapshots.public_data_tree = AppendOnlyTreeSnapshot {
            root: self.public_data_tree.get_root(),
            next_available_leaf_index: MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX as Field,
        };

        // If the tree is rebuilt and the start index has changed, call `build_hints_for_fee_payer_balance` again to
        // update the hints.
    }

    pub fn build_hints_for_fee_payer_balance(&mut self) {
        let start_index = self.public_data_tree.get_next_available_index()
            - TEST_PUBLIC_DATA_SUBTREE_WIDTH as Field;
        let leaf_index = start_index + self.fee_payer_preimage_index as Field;
        self.tree_snapshot_diff_hints.fee_payer_balance_membership_witness = MembershipWitness {
            leaf_index,
            sibling_path: self.public_data_tree.get_sibling_path(leaf_index),
        };
    }

    pub fn execute(self) -> TxRollupPublicInputs {
        let hiding_kernel_proof_data =
            RollupFixtureBuilder::make_proof_data(self.private_tail, self.hiding_kernel_vk_index);

        let fee_payer_balance_leaf_preimage =
            self.pre_existing_public_data_preimages[self.fee_payer_preimage_index];

        PrivateTxBaseRollupPrivateInputs {
            hiding_kernel_proof_data,
            constants: self.constants,
            contract_class_log_fields: self.contract_class_log_fields,
            start_tree_snapshots: self.start_tree_snapshots,
            start_sponge_blob: self.start_sponge_blob,
            fee_payer_balance_leaf_preimage,
            anchor_block_archive_sibling_path: self.anchor_block_archive_sibling_path,
            tree_snapshot_diff_hints: self.tree_snapshot_diff_hints,
        }
            .execute()
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: TxRollupPublicInputs) {
        assert_eq(pi.num_txs, 1);

        assert_eq(pi.constants, self.constants);

        assert_eq(pi.start_tree_snapshots, self.start_tree_snapshots);
        assert(pi.end_tree_snapshots != pi.start_tree_snapshots);
        // The expected value of `end_tree_snapshots` is tested in `end_tree_snapshot_tests.nr`.

        assert_eq(pi.start_sponge_blob, self.start_sponge_blob);
        assert(pi.end_sponge_blob != pi.start_sponge_blob);
        // The expected value of `end_sponge_blob` is tested in `end_sponge_blob_tests.nr`.

        // The expected value of `out_hash` is tested in `out_hash_tests.nr`.

        let expected_fee = self.get_transaction_fee();
        assert_eq(pi.accumulated_fees, expected_fee);

        assert_eq(pi.accumulated_mana_used, self.private_tail.gas_used.l2_gas as Field);
    }
}
