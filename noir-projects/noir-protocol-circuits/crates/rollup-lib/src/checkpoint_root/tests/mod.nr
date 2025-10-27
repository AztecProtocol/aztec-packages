mod blob_tests;
mod child_proof_vk_tests;
mod consecutive_rollups_tests;
mod rollup_structure_tests;
mod start_states_tests;

use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs},
    checkpoint_root::{
        checkpoint_root_rollup_private_inputs::{
            CheckpointRootRollupHints, CheckpointRootRollupPrivateInputs,
        },
        checkpoint_root_single_block_rollup_private_inputs::CheckpointRootSingleBlockRollupPrivateInputs,
    },
    tests::RollupFixtureBuilder,
    tx_merge::accumulate_out_hash,
};
use std::test::OracleMock;
use types::{
    abis::{
        checkpoint_header::CheckpointHeader, epoch_constant_data::EpochConstantData,
        fee_recipient::FeeRecipient, sponge_blob::SpongeBlob,
    },
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    },
    content_commitment::ContentCommitment,
    tests::utils::{assert_array_eq, make_fixture, pad_end},
    traits::{Hash, Serialize},
};

fn is_first_block(vk_index: u32) -> bool {
    (vk_index == BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX)
        | (vk_index == BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX)
        | (vk_index == BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX)
}

struct TestBuilder {
    fixture_builder: RollupFixtureBuilder,
    left_rollup: BlockRollupPublicInputs,
    left_rollup_vk_index: u32,
    right_rollup: BlockRollupPublicInputs,
    right_rollup_vk_index: u32,
    is_single_block: bool,
    hints: CheckpointRootRollupHints,
}

impl TestBuilder {
    pub fn default() -> Self {
        Self::new(
            BLOCK_MERGE_ROLLUP_VK_INDEX,
            2,
            BLOCK_ROOT_ROLLUP_VK_INDEX,
            1,
        )
    }

    pub fn default_single_block() -> Self {
        Self::new_single_block(BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX)
    }

    pub fn default_with_blob_fields<let N: u32>(blobs_fields: [Field; N]) -> Self {
        Self::new_with_blob_fields(
            BLOCK_MERGE_ROLLUP_VK_INDEX,
            2,
            BLOCK_ROOT_ROLLUP_VK_INDEX,
            1,
            blobs_fields,
            // Make this the only checkpoint in the epoch, so that we can test the end blob accumulator against the
            // final blob challenges.
            1,
            false,
        )
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_blocks: u32,
        right_rollup_vk_index: u32,
        num_right_blocks: u32,
    ) -> Self {
        let blobs_fields: [Field; 14] = make_fixture(25339);
        Self::new_with_blob_fields(
            left_rollup_vk_index,
            num_left_blocks,
            right_rollup_vk_index,
            num_right_blocks,
            blobs_fields,
            2,
            false,
        )
    }

    pub fn new_single_block(vk_index: u32) -> Self {
        let blobs_fields: [Field; 8] = make_fixture(89243);
        Self::new_with_blob_fields(vk_index, 1, 0, 0, blobs_fields, 1, true)
    }

    fn new_with_blob_fields<let N: u32>(
        left_rollup_vk_index: u32,
        num_left_blocks: u32,
        right_rollup_vk_index: u32,
        num_right_blocks: u32,
        blobs_fields: [Field; N],
        num_checkpoints: u32,
        is_single_block: bool,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_blocks);
        if !is_single_block {
            Self::validate_input_vk_index(right_rollup_vk_index, num_right_blocks);
        }

        let mut fixture_builder = RollupFixtureBuilder::new();
        let start_block_number = fixture_builder.start_block_number;

        let slot_number = fixture_builder.start_slot_number;
        fixture_builder.end_slot_number = slot_number + num_checkpoints as Field - 1;

        if !is_first_block(left_rollup_vk_index)
            & (left_rollup_vk_index != BLOCK_MERGE_ROLLUP_VK_INDEX) {
            // Change the start_block_number to be smaller than the left rollup's start_block_number so that the in_hash
            // won't be set on the left rollup.
            fixture_builder.start_block_number = start_block_number - 1;
        }
        let mut left_rollup = fixture_builder.get_merged_block_rollup_public_inputs(
            start_block_number,
            start_block_number + num_left_blocks - 1,
        );

        if is_first_block(right_rollup_vk_index) {
            // Change the start_block_number to be the right rollup's start_block_number so that the in_hash will be set
            // on the right rollup.
            fixture_builder.start_block_number = start_block_number + num_left_blocks;
        }
        let mut right_rollup = fixture_builder.get_merged_block_rollup_public_inputs(
            start_block_number + num_left_blocks,
            start_block_number + num_left_blocks + num_right_blocks - 1,
        );

        let previous_block_number = start_block_number - 1;
        let (previous_archive, previous_archive_sibling_path) =
            fixture_builder.build_archive_tree(previous_block_number);

        left_rollup.previous_archive = previous_archive;

        left_rollup.start_sponge_blob = SpongeBlob::new(N);

        // Update the end_sponge_blob of the right rollup to be the actual sponge that absorbs all the blob fields.
        let mut sponge_blob = SpongeBlob::new(N);
        sponge_blob.absorb(blobs_fields, N);
        if is_single_block {
            left_rollup.end_sponge_blob = sponge_blob;
        } else {
            right_rollup.end_sponge_blob = sponge_blob;
        }

        let hints = CheckpointRootRollupHints {
            previous_block_header: fixture_builder.get_block_header(previous_block_number),
            previous_archive_sibling_path,
            start_blob_accumulator: fixture_builder.get_blob_accumulator(slot_number - 1),
            final_blob_challenges: fixture_builder.get_final_blob_challenges(),
            blobs_fields: pad_end(blobs_fields),
            blob_commitments: fixture_builder.get_blob_commitments(slot_number),
            blobs_hash: slot_number + 9325034,
        };

        Self {
            fixture_builder,
            left_rollup,
            left_rollup_vk_index,
            right_rollup,
            right_rollup_vk_index,
            hints,
            is_single_block,
        }
    }

    fn validate_input_vk_index(vk_index: u32, num_blocks: u32) {
        if num_blocks == 0 {
            assert_eq(vk_index, 0);
        } else if num_blocks != 1 {
            assert_eq(vk_index, BLOCK_MERGE_ROLLUP_VK_INDEX);
        } else {
            assert(
                (vk_index == BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> CheckpointRollupPublicInputs {
        if self.is_single_block {
            CheckpointRootSingleBlockRollupPrivateInputs {
                previous_rollup: RollupFixtureBuilder::make_proof_data(
                    self.left_rollup,
                    self.left_rollup_vk_index,
                ),
                hints: self.hints,
            }
                .execute()
        } else {
            CheckpointRootRollupPrivateInputs {
                previous_rollups: [
                    RollupFixtureBuilder::make_proof_data(
                        self.left_rollup,
                        self.left_rollup_vk_index,
                    ),
                    RollupFixtureBuilder::make_proof_data(
                        self.right_rollup,
                        self.right_rollup_vk_index,
                    ),
                ],
                hints: self.hints,
            }
                .execute()
        }
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn execute_with_mock(self) -> (CheckpointRollupPublicInputs, OracleMock) {
        // Safety: TODO(#10323): This is added to mock the oracle call and return data for `evaluate_blobs_and_batch`.
        // When simulation times of unconstrained are improved and `mock_blob_oracle` is removed, this can be removed.
        unsafe {
            self.execute_unconstrained_and_mock()
        }
    }

    pub fn execute_with_mock_and_fail(self) {
        let _ = self.execute_with_mock();
    }

    unconstrained fn execute_unconstrained_and_mock(
        self,
    ) -> (CheckpointRollupPublicInputs, OracleMock) {
        let end_blob_accumulator_mock =
            self.fixture_builder.get_blob_accumulator(self.fixture_builder.start_slot_number);

        let evaluate_blobs_and_batch_mock =
            OracleMock::mock("evaluateBlobs").returns(end_blob_accumulator_mock.serialize());

        (self.execute(), evaluate_blobs_and_batch_mock)
    }

    pub fn get_expected_checkpoint_header(self) -> CheckpointHeader {
        let left = self.left_rollup;
        let right = if self.is_single_block {
            self.left_rollup
        } else {
            self.right_rollup
        };

        let out_hash = if self.is_single_block {
            left.out_hash
        } else {
            accumulate_out_hash(left.out_hash, right.out_hash)
        };
        let total_mana_used = if self.is_single_block {
            left.accumulated_mana_used
        } else {
            left.accumulated_mana_used + right.accumulated_mana_used
        };

        CheckpointHeader {
            last_archive_root: left.previous_archive.root,
            content_commitment: ContentCommitment {
                blobs_hash: self.hints.blobs_hash,
                in_hash: left.in_hash,
                out_hash,
            },
            slot_number: left.constants.slot_number,
            timestamp: right.end_timestamp,
            coinbase: left.constants.coinbase,
            fee_recipient: left.constants.fee_recipient,
            gas_fees: left.constants.gas_fees,
            total_mana_used,
        }
    }

    pub fn assert_expected_public_inputs(self, pi: CheckpointRollupPublicInputs) {
        let left = self.left_rollup;
        let right = if self.is_single_block {
            self.left_rollup
        } else {
            self.right_rollup
        };
        let hints = self.hints;

        assert_eq(pi.num_checkpoints(), 1);

        let expected_constants = EpochConstantData {
            chain_id: left.constants.chain_id,
            version: left.constants.version,
            vk_tree_root: left.constants.vk_tree_root,
            protocol_contracts_hash: left.constants.protocol_contracts_hash,
            prover_id: left.constants.prover_id,
        };
        assert_eq(left.constants, right.constants);
        assert_eq(pi.constants, expected_constants);

        assert_eq(pi.previous_archive, left.previous_archive);
        assert_eq(pi.new_archive, right.new_archive);
        assert(pi.previous_archive != pi.new_archive);

        let expected_checkpoint_header = self.get_expected_checkpoint_header();
        assert_array_eq(
            pi.checkpoint_header_hashes,
            [expected_checkpoint_header.hash()],
        );

        let total_fees = if self.is_single_block {
            left.accumulated_fees
        } else {
            left.accumulated_fees + right.accumulated_fees
        };
        let fee = FeeRecipient { recipient: left.constants.coinbase, value: total_fees };
        assert_array_eq(pi.fees, [fee]);

        assert_eq(pi.start_blob_accumulator, hints.start_blob_accumulator);
        assert(pi.start_blob_accumulator != pi.end_blob_accumulator);

        assert_eq(pi.final_blob_challenges, hints.final_blob_challenges);
    }

    pub fn assert_mock_called(_self: Self, evaluate_blobs_and_batch_mock: OracleMock) {
        // Safety: This is just a test.
        unsafe {
            assert_eq(evaluate_blobs_and_batch_mock.times_called(), 1);
            // Clear the mock to get the correct number of times called when triggered again.
            evaluate_blobs_and_batch_mock.clear();
        }
    }
}
