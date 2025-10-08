mod child_proof_vk_tests;
mod consecutive_tx_rollups_tests;
mod rollup_structure_tests;

use crate::{
    abis::TxRollupPublicInputs, tests::RollupFixtureBuilder,
    tx_merge::tx_merge_rollup_private_inputs::TxMergeRollupPrivateInputs,
};
use types::{
    constants::{
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    hash::accumulate_sha256,
};

struct TestBuilder {
    left_rollup: TxRollupPublicInputs,
    left_rollup_vk_index: u32,
    num_left_txs: u16,
    right_rollup: TxRollupPublicInputs,
    right_rollup_vk_index: u32,
    num_right_txs: u16,
}

impl TestBuilder {
    pub fn default() -> Self {
        // Both rollups have a single tx.
        Self::new(
            PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
            1,
            PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
            1,
        )
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_txs: u16,
        right_rollup_vk_index: u32,
        num_right_txs: u16,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_txs);
        Self::validate_input_vk_index(right_rollup_vk_index, num_right_txs);

        let fixture_builder = RollupFixtureBuilder::new();
        let start_tx_index = 6;

        let left = fixture_builder.get_merged_tx_rollup_public_inputs(
            start_tx_index,
            start_tx_index + num_left_txs - 1,
        );
        let right = fixture_builder.get_merged_tx_rollup_public_inputs(
            start_tx_index + num_left_txs,
            start_tx_index + num_left_txs + num_right_txs - 1,
        );

        Self {
            left_rollup: left,
            left_rollup_vk_index,
            num_left_txs,
            right_rollup: right,
            right_rollup_vk_index,
            num_right_txs,
        }
    }

    fn validate_input_vk_index(vk_index: u32, num_txs: u16) {
        if num_txs != 1 {
            assert_eq(vk_index, TX_MERGE_ROLLUP_VK_INDEX);
        } else {
            assert(
                (vk_index == PRIVATE_TX_BASE_ROLLUP_VK_INDEX)
                    | (vk_index == PUBLIC_TX_BASE_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> TxRollupPublicInputs {
        let previous_rollups = [
            RollupFixtureBuilder::make_proof_data(self.left_rollup, self.left_rollup_vk_index),
            RollupFixtureBuilder::make_proof_data(self.right_rollup, self.right_rollup_vk_index),
        ];
        TxMergeRollupPrivateInputs { previous_rollups }.execute()
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: TxRollupPublicInputs) {
        let left = self.left_rollup;
        let right = self.right_rollup;

        assert_eq(left.num_txs, self.num_left_txs);
        assert_eq(right.num_txs, self.num_right_txs);
        assert_eq(pi.num_txs, self.num_left_txs + self.num_right_txs);

        assert_eq(pi.constants, left.constants);
        assert_eq(pi.constants, right.constants);

        assert_eq(pi.start_tree_snapshots, left.start_tree_snapshots);
        assert_eq(pi.end_tree_snapshots, right.end_tree_snapshots);
        assert(pi.start_tree_snapshots != pi.end_tree_snapshots);

        assert_eq(pi.start_sponge_blob, left.start_sponge_blob);
        assert_eq(pi.end_sponge_blob, right.end_sponge_blob);
        assert(pi.start_sponge_blob != pi.end_sponge_blob);

        let expected_out_hash = if (left.out_hash != 0) & (right.out_hash != 0) {
            accumulate_sha256(left.out_hash, right.out_hash)
        } else if left.out_hash != 0 {
            left.out_hash
        } else {
            right.out_hash
        };
        assert_eq(pi.out_hash, expected_out_hash);
        // The tests to cover all the above scenarios are in `consecutive_tx_rollups_tests.nr`.

        assert_eq(pi.accumulated_fees, left.accumulated_fees + right.accumulated_fees);
        assert_eq(
            pi.accumulated_mana_used,
            left.accumulated_mana_used + right.accumulated_mana_used,
        );
    }
}
