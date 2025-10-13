mod child_proof_vk_tests;
mod consecutive_rollups_tests;
mod failures_tests;
mod rollup_structure_tests;

use crate::{
    abis::{BlockRollupPublicInputs, TxRollupPublicInputs},
    block_root::{
        block_root_empty_tx_first_rollup_private_inputs::BlockRootEmptyTxFirstRollupPrivateInputs,
        block_root_first_rollup_private_inputs::BlockRootFirstRollupPrivateInputs,
        block_root_rollup_private_inputs::BlockRootRollupPrivateInputs,
        block_root_single_tx_first_rollup_private_inputs::BlockRootSingleTxFirstRollupPrivateInputs,
        block_root_single_tx_rollup_private_inputs::BlockRootSingleTxRollupPrivateInputs,
        components::BlockRollupPublicInputsComposer,
    },
    tests::RollupFixtureBuilder,
};
use parity_lib::ParityPublicInputs;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_header::BlockHeader,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH, PARITY_ROOT_VK_INDEX,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    hash::accumulate_sha256,
    merkle_tree::root_from_sibling_path,
    traits::Hash,
};

struct TestBuilder {
    left_rollup: TxRollupPublicInputs,
    left_rollup_vk_index: u32,
    num_left_txs: u16,
    right_rollup: TxRollupPublicInputs,
    right_rollup_vk_index: u32,
    num_right_txs: u16,
    is_first_block_root: bool,
    parity_root: ParityPublicInputs,
    parity_root_vk_index: u32,
    previous_l1_to_l2: AppendOnlyTreeSnapshot,
    new_l1_to_l2_message_subtree_root_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH],
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    checkpoint_constants: CheckpointConstantData,
}

impl TestBuilder {
    pub fn default(is_first_block_root: bool, has_single_tx: bool) -> Self {
        if has_single_tx {
            Self::new_single_rollup(PUBLIC_TX_BASE_ROLLUP_VK_INDEX, 1, is_first_block_root)
        } else {
            Self::new(
                TX_MERGE_ROLLUP_VK_INDEX,
                2,
                TX_MERGE_ROLLUP_VK_INDEX,
                2,
                is_first_block_root,
            )
        }
    }

    pub fn new_single_rollup(
        rollup_vk_index: u32,
        left_txs: u16,
        is_first_block_root: bool,
    ) -> Self {
        Self::new(rollup_vk_index, left_txs, 0, 0, is_first_block_root)
    }

    pub fn new_empty() -> Self {
        Self::new(0, 0, 0, 0, true)
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_txs: u16,
        right_rollup_vk_index: u32,
        num_right_txs: u16,
        is_first_block_root: bool,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_txs);
        Self::validate_input_vk_index(right_rollup_vk_index, num_right_txs);

        let fixture_builder = RollupFixtureBuilder::new();
        let start_tx_index = 6;

        let mut left_rollup = fixture_builder.get_merged_tx_rollup_public_inputs(
            start_tx_index,
            start_tx_index + num_left_txs - 1,
        );
        let mut right_rollup = fixture_builder.get_merged_tx_rollup_public_inputs(
            start_tx_index + num_left_txs,
            start_tx_index + num_left_txs + num_right_txs - 1,
        );

        let slot_number = fixture_builder.start_slot_number;
        let parity_root = fixture_builder.get_parity_public_inputs(slot_number);

        let (previous_l1_to_l2, new_l1_to_l2_message_subtree_root_sibling_path, new_l1_to_l2) =
            fixture_builder.build_l1_to_l2_message_subtree_for_insertion(slot_number);
        left_rollup.constants.l1_to_l2_tree_snapshot = new_l1_to_l2;
        right_rollup.constants.l1_to_l2_tree_snapshot = new_l1_to_l2;

        let block_number = fixture_builder.start_block_number;
        let (previous_archive, new_archive_sibling_path) =
            fixture_builder.build_archive_tree_for_insertion(block_number);
        left_rollup.constants.last_archive = previous_archive;
        right_rollup.constants.last_archive = previous_archive;

        let checkpoint_constants = fixture_builder.get_checkpoint_constant_data(slot_number);

        Self {
            left_rollup,
            left_rollup_vk_index,
            num_left_txs,
            right_rollup,
            right_rollup_vk_index,
            num_right_txs,
            is_first_block_root,
            parity_root,
            parity_root_vk_index: PARITY_ROOT_VK_INDEX,
            previous_l1_to_l2,
            new_l1_to_l2_message_subtree_root_sibling_path,
            new_archive_sibling_path,
            checkpoint_constants,
        }
    }

    fn validate_input_vk_index(vk_index: u32, num_txs: u16) {
        if num_txs == 0 {
            // Both 0s when there's no rollups.
            assert_eq(vk_index, 0);
        } else if num_txs != 1 {
            assert_eq(vk_index, TX_MERGE_ROLLUP_VK_INDEX);
        } else {
            assert(
                (vk_index == PRIVATE_TX_BASE_ROLLUP_VK_INDEX)
                    | (vk_index == PUBLIC_TX_BASE_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> BlockRollupPublicInputs {
        if self.is_first_block_root {
            self.execute_first_block_root()
        } else {
            self.execute_non_first_block_root()
        }
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    fn execute_first_block_root(self) -> BlockRollupPublicInputs {
        let parity_root =
            RollupFixtureBuilder::make_proof_data(self.parity_root, self.parity_root_vk_index);

        let previous_rollups = [
            RollupFixtureBuilder::make_proof_data(self.left_rollup, self.left_rollup_vk_index),
            RollupFixtureBuilder::make_proof_data(self.right_rollup, self.right_rollup_vk_index),
        ];

        let new_l1_to_l2_message_subtree_root_sibling_path =
            self.new_l1_to_l2_message_subtree_root_sibling_path;
        let new_archive_sibling_path = self.new_archive_sibling_path;

        if self.num_left_txs == 0 {
            let left = self.left_rollup;
            let previous_state = StateReference {
                l1_to_l2_message_tree: self.previous_l1_to_l2,
                partial: self.left_rollup.start_tree_snapshots,
            };
            BlockRootEmptyTxFirstRollupPrivateInputs {
                parity_root,
                previous_archive: left.constants.last_archive,
                previous_state,
                constants: self.checkpoint_constants,
                start_sponge_blob: left.start_sponge_blob,
                timestamp: left.constants.global_variables.timestamp,
                new_l1_to_l2_message_subtree_root_sibling_path,
                new_archive_sibling_path,
            }
                .execute()
        } else if self.num_right_txs == 0 {
            BlockRootSingleTxFirstRollupPrivateInputs {
                parity_root,
                previous_rollup: previous_rollups[0],
                previous_l1_to_l2: self.previous_l1_to_l2,
                new_l1_to_l2_message_subtree_root_sibling_path,
                new_archive_sibling_path,
            }
                .execute()
        } else {
            BlockRootFirstRollupPrivateInputs {
                parity_root,
                previous_rollups,
                previous_l1_to_l2: self.previous_l1_to_l2,
                new_l1_to_l2_message_subtree_root_sibling_path,
                new_archive_sibling_path,
            }
                .execute()
        }
    }

    fn execute_non_first_block_root(self) -> BlockRollupPublicInputs {
        let previous_rollups = [
            RollupFixtureBuilder::make_proof_data(self.left_rollup, self.left_rollup_vk_index),
            RollupFixtureBuilder::make_proof_data(self.right_rollup, self.right_rollup_vk_index),
        ];

        let new_archive_sibling_path = self.new_archive_sibling_path;

        if self.num_right_txs == 0 {
            BlockRootSingleTxRollupPrivateInputs {
                previous_rollup: previous_rollups[0],
                new_archive_sibling_path,
            }
                .execute()
        } else {
            BlockRootRollupPrivateInputs { previous_rollups, new_archive_sibling_path }.execute()
        }
    }

    pub fn assert_expected_public_inputs(self, pi: BlockRollupPublicInputs) {
        // The private inputs of the empty block root are also constructed from the left rollup.
        let left = self.left_rollup;

        let right = if self.num_right_txs == 0 {
            self.left_rollup
        } else {
            self.right_rollup
        };

        let is_empty_block = self.num_left_txs == 0;
        let is_single_tx_block = self.num_right_txs == 0;

        assert_eq(pi.num_blocks(), 1);

        // --- Constants ---

        let constants = CheckpointConstantData {
            chain_id: left.constants.global_variables.chain_id,
            version: left.constants.global_variables.version,
            vk_tree_root: left.constants.vk_tree_root,
            protocol_contracts_hash: left.constants.protocol_contracts_hash,
            prover_id: left.constants.prover_id,
            slot_number: left.constants.global_variables.slot_number,
            coinbase: left.constants.global_variables.coinbase,
            fee_recipient: left.constants.global_variables.fee_recipient,
            gas_fees: left.constants.global_variables.gas_fees,
        };
        assert_eq(pi.constants, constants);

        // --- Sponge blobs ---

        assert_eq(pi.start_sponge_blob, left.start_sponge_blob);

        let block_end_marker = BlockRollupPublicInputsComposer::create_block_end_marker(
            self.num_left_txs + self.num_right_txs,
        );
        let mut expected_end_sponge_blob = right.end_sponge_blob;
        expected_end_sponge_blob.absorb([block_end_marker], 1);
        assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);

        // --- Archive ---

        assert_eq(pi.previous_archive, left.constants.last_archive);

        // Check new archive by reconstructing the block header.
        let sponge_blob_hash = expected_end_sponge_blob.squeeze();
        let block_header = BlockHeader {
            last_archive: pi.previous_archive,
            state: pi.end_state,
            sponge_blob_hash,
            global_variables: left.constants.global_variables,
            total_fees: pi.accumulated_fees,
            total_mana_used: pi.accumulated_mana_used,
        };
        let expected_archive_root = root_from_sibling_path(
            block_header.hash(),
            pi.previous_archive.next_available_leaf_index,
            self.new_archive_sibling_path,
        );
        assert_eq(pi.new_archive.root, expected_archive_root);
        // The index always increments by 1.
        assert_eq(
            pi.new_archive.next_available_leaf_index,
            pi.previous_archive.next_available_leaf_index + 1,
        );

        // --- Partial state ---

        assert_eq(pi.start_state.partial, left.start_tree_snapshots);
        assert_eq(pi.end_state.partial, right.end_tree_snapshots);
        if is_empty_block {
            assert_eq(pi.start_state.partial, pi.end_state.partial);
        } else {
            assert(pi.start_state.partial != pi.end_state.partial);
        }

        // --- L1 to L2 message tree ---

        let expected_previous_l1_to_l2 = if self.is_first_block_root {
            self.previous_l1_to_l2
        } else {
            self.left_rollup.constants.l1_to_l2_tree_snapshot
        };
        assert_eq(pi.start_state.l1_to_l2_message_tree, expected_previous_l1_to_l2);

        assert_eq(
            pi.end_state.l1_to_l2_message_tree,
            self.left_rollup.constants.l1_to_l2_tree_snapshot,
        );

        // --- Timestamps ---

        assert_eq(pi.start_timestamp, left.constants.global_variables.timestamp);
        assert_eq(pi.start_timestamp, pi.end_timestamp);

        // --- In hash ---

        let expected_in_hash = if self.is_first_block_root {
            self.parity_root.sha_root
        } else {
            0
        };
        assert_eq(pi.in_hash, expected_in_hash);

        // --- Out hash --

        let expected_out_hash = if is_empty_block {
            0
        } else if is_single_tx_block | (right.out_hash == 0) {
            left.out_hash
        } else if left.out_hash == 0 {
            right.out_hash
        } else {
            accumulate_sha256(left.out_hash, right.out_hash)
        };
        assert_eq(pi.out_hash, expected_out_hash);

        // --- fees / mana used ---

        let (expected_fees, expected_mana_used) = if is_empty_block {
            (0, 0)
        } else if is_single_tx_block {
            (left.accumulated_fees, left.accumulated_mana_used)
        } else {
            (
                left.accumulated_fees + right.accumulated_fees,
                left.accumulated_mana_used + right.accumulated_mana_used,
            )
        };
        assert_eq(pi.accumulated_fees, expected_fees);
        assert_eq(pi.accumulated_mana_used, expected_mana_used);
    }
}
