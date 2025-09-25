mod child_proof_vk_tests;
mod consecutive_checkpoint_rollups_tests;
mod rollup_structure_tests;

use crate::{
    abis::CheckpointRollupPublicInputs,
    checkpoint_merge::checkpoint_merge_rollup_private_inputs::CheckpointMergeRollupPrivateInputs,
    tests::RollupFixtureBuilder,
};
use types::{
    abis::fee_recipient::FeeRecipient,
    constants::{
        AZTEC_MAX_EPOCH_DURATION, CHECKPOINT_MERGE_ROLLUP_VK_INDEX, CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
        CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    },
    traits::Empty,
};

struct TestBuilder {
    left_rollup: CheckpointRollupPublicInputs,
    left_rollup_vk_index: u32,
    num_left_checkpoints: u16,
    right_rollup: CheckpointRollupPublicInputs,
    right_rollup_vk_index: u32,
    num_right_checkpoints: u16,
}

impl TestBuilder {
    pub fn default() -> Self {
        Self::new(
            CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
            2,
            CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
            1,
        )
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_checkpoints: u16,
        right_rollup_vk_index: u32,
        num_right_checkpoints: u16,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_checkpoints);
        Self::validate_input_vk_index(right_rollup_vk_index, num_right_checkpoints);

        let mut fixture_builder = RollupFixtureBuilder::new();
        let start_slot_number = fixture_builder.start_slot_number;

        let left_rollup = fixture_builder.get_merged_checkpoint_rollup_public_inputs(
            start_slot_number,
            start_slot_number + num_left_checkpoints as Field - 1,
        );
        let right_rollup = fixture_builder.get_merged_checkpoint_rollup_public_inputs(
            start_slot_number + num_left_checkpoints as Field,
            start_slot_number + (num_left_checkpoints + num_right_checkpoints) as Field - 1,
        );

        Self {
            left_rollup,
            left_rollup_vk_index,
            num_left_checkpoints,
            right_rollup,
            right_rollup_vk_index,
            num_right_checkpoints,
        }
    }

    fn validate_input_vk_index(vk_index: u32, num_checkpoints: u16) {
        if num_checkpoints != 1 {
            assert_eq(vk_index, CHECKPOINT_MERGE_ROLLUP_VK_INDEX);
        } else {
            assert(
                (vk_index == CHECKPOINT_ROOT_ROLLUP_VK_INDEX)
                    | (vk_index == CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> CheckpointRollupPublicInputs {
        let previous_rollups = [
            RollupFixtureBuilder::make_proof_data(self.left_rollup, self.left_rollup_vk_index),
            RollupFixtureBuilder::make_proof_data(self.right_rollup, self.right_rollup_vk_index),
        ];
        CheckpointMergeRollupPrivateInputs { previous_rollups }.execute()
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: CheckpointRollupPublicInputs) {
        let left = self.left_rollup;
        let right = self.right_rollup;

        assert_eq(pi.num_checkpoints(), self.num_left_checkpoints + self.num_right_checkpoints);

        assert_eq(pi.constants, left.constants);
        assert_eq(pi.constants, right.constants);

        assert_eq(pi.previous_archive, left.previous_archive);
        assert_eq(pi.new_archive, right.new_archive);
        assert(pi.previous_archive != pi.new_archive);

        let mut expected_header_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        let mut expected_fees = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];
        for i in 0..self.num_left_checkpoints as u32 {
            expected_header_hashes[i] = left.checkpoint_header_hashes[i];
            expected_fees[i] = left.fees[i];
            assert(left.checkpoint_header_hashes[i] != 0);
            assert(!left.fees[i].is_empty());
        }
        let offset = self.num_left_checkpoints as u32;
        for i in 0..self.num_right_checkpoints as u32 {
            expected_header_hashes[i + offset] = right.checkpoint_header_hashes[i];
            expected_fees[i + offset] = right.fees[i];
            assert(right.checkpoint_header_hashes[i] != 0);
            assert(!right.fees[i].is_empty());
        }
        assert_eq(pi.checkpoint_header_hashes, expected_header_hashes);
        assert_eq(pi.fees, expected_fees);

        assert_eq(pi.start_blob_accumulator, left.start_blob_accumulator);
        assert_eq(pi.end_blob_accumulator, right.end_blob_accumulator);
        assert(pi.start_blob_accumulator != pi.end_blob_accumulator);

        assert_eq(pi.final_blob_challenges, left.final_blob_challenges);
        assert_eq(pi.final_blob_challenges, right.final_blob_challenges);
    }
}
