mod child_proof_vk_tests;
mod consecutive_block_rollups_tests;
mod no_txs_tests;
mod rollup_structure_tests;

use crate::{
    abis::BlockRollupPublicInputs,
    block_merge::{
        block_merge_rollup::{self, BlockMergeRollupPrivateInputs},
        utils::merge_block_rollups::accumulate_block_headers_hash,
    },
    tests::RollupFixtureBuilder,
};
use types::{
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    },
    hash::accumulate_sha256,
};

struct TestBuilder {
    left_rollup: BlockRollupPublicInputs,
    left_rollup_vk_index: u32,
    num_left_blocks: u16,
    right_rollup: BlockRollupPublicInputs,
    right_rollup_vk_index: u32,
    num_right_blocks: u16,
}

impl TestBuilder {
    pub fn default() -> Self {
        // Distinct child variants, so a test that tampers with one child's vk hash does not also invalidate the other.
        Self::new(
            BLOCK_ROOT_ROLLUP_VK_INDEX,
            1,
            BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
            1,
        )
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_blocks: u16,
        right_rollup_vk_index: u32,
        num_right_blocks: u16,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_blocks);
        Self::validate_input_vk_index(right_rollup_vk_index, num_right_blocks);

        let fixture_builder = RollupFixtureBuilder::new();
        let start_block_number = fixture_builder.start_block_number;

        let left_rollup = fixture_builder.get_merged_block_rollup_public_inputs(
            start_block_number,
            start_block_number + num_left_blocks as u32 - 1,
        );
        let right_rollup = fixture_builder.get_merged_block_rollup_public_inputs(
            start_block_number + num_left_blocks as u32,
            start_block_number + (num_left_blocks + num_right_blocks) as u32 - 1,
        );

        Self {
            left_rollup,
            left_rollup_vk_index,
            num_left_blocks,
            right_rollup,
            right_rollup_vk_index,
            num_right_blocks,
        }
    }

    fn validate_input_vk_index(vk_index: u32, num_blocks: u16) {
        if num_blocks != 1 {
            assert_eq(vk_index, BLOCK_MERGE_ROLLUP_VK_INDEX);
        } else {
            assert(
                (vk_index == BLOCK_ROOT_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> BlockRollupPublicInputs {
        let previous_rollups = [
            RollupFixtureBuilder::make_proof_data(self.left_rollup, self.left_rollup_vk_index),
            RollupFixtureBuilder::make_proof_data(self.right_rollup, self.right_rollup_vk_index),
        ];
        let inputs = BlockMergeRollupPrivateInputs { previous_rollups };
        block_merge_rollup::execute(inputs)
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: BlockRollupPublicInputs) {
        let left = self.left_rollup;
        let right = self.right_rollup;

        let num_blocks = self.num_left_blocks + self.num_right_blocks;
        assert_eq(pi.num_blocks(), num_blocks);

        assert_eq(pi.constants, left.constants);
        assert_eq(pi.constants, right.constants);

        assert_eq(pi.previous_archive, left.previous_archive);
        assert_eq(pi.new_archive, right.new_archive);
        assert(pi.previous_archive != pi.new_archive);

        assert_eq(pi.start_state, left.start_state);
        assert_eq(pi.end_state, right.end_state);
        assert(pi.start_state != pi.end_state);

        assert_eq(pi.start_sponge_blob, left.start_sponge_blob);
        assert_eq(pi.end_sponge_blob, right.end_sponge_blob);
        assert(pi.start_sponge_blob != pi.end_sponge_blob);

        assert_eq(pi.timestamp, left.timestamp);
        assert_eq(pi.timestamp, right.timestamp);

        let expected_block_headers_hash =
            accumulate_block_headers_hash(left.block_headers_hash, right.block_headers_hash);
        assert_eq(pi.block_headers_hash, expected_block_headers_hash);

        // The start of the message sponge comes from the left rollup; its end comes from the right rollup.
        assert_eq(pi.start_msg_sponge, left.start_msg_sponge);
        assert_eq(pi.end_msg_sponge, right.end_msg_sponge);

        let expected_out_hash = if (left.out_hash != 0) & (right.out_hash != 0) {
            accumulate_sha256(left.out_hash, right.out_hash)
        } else if left.out_hash != 0 {
            left.out_hash
        } else {
            right.out_hash
        };
        assert_eq(pi.out_hash, expected_out_hash);
        // The tests to cover all the above scenarios are in `consecutive_block_rollups_tests.nr`.

        assert_eq(pi.accumulated_fees, left.accumulated_fees + right.accumulated_fees);
        assert_eq(
            pi.accumulated_mana_used,
            left.accumulated_mana_used + right.accumulated_mana_used,
        );
    }
}
