mod blob_tests;
mod child_proof_vk_tests;
mod consecutive_rollups_tests;
mod msgs_only_tests;
mod out_hash_tests;
mod parity_tests;
mod rollup_structure_tests;
mod start_states_tests;

use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs, ParityPublicInputs},
    block_merge::accumulate_block_headers_hash,
    checkpoint_root::{
        checkpoint_root_rollup::{
            self, CheckpointRootRollupHints, CheckpointRootRollupPrivateInputs,
        },
        checkpoint_root_single_block_rollup::{self, CheckpointRootSingleBlockRollupPrivateInputs},
    },
    tests::RollupFixtureBuilder,
    tx_merge::accumulate_out_hash,
};
use protocol_test_utils::{assert_array_eq, make_fixture, pad_end};
use std::test::OracleMock;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, checkpoint_header::CheckpointHeader,
        epoch_constant_data::EpochConstantData, fee_recipient::FeeRecipient,
    },
    blob_data::{create_checkpoint_end_marker, SpongeBlob},
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
        BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, OUT_HASH_TREE_LEAF_COUNT, PARITY_ROOT_VK_INDEX,
    },
    merkle_tree::compute_sha_tree_root,
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
    parity_root: ParityPublicInputs,
    parity_root_vk_index: u32,
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

    pub fn default_with_blob_fields<let N: u32>(blob_fields: [Field; N]) -> Self {
        Self::new_with_blob_fields(
            BLOCK_MERGE_ROLLUP_VK_INDEX,
            2,
            BLOCK_ROOT_ROLLUP_VK_INDEX,
            1,
            blob_fields,
            0,
            false,
        )
    }

    pub fn default_at_index(checkpoint_index: u32) -> Self {
        Self::new_with_random_blob_fields(
            BLOCK_MERGE_ROLLUP_VK_INDEX,
            2,
            BLOCK_ROOT_ROLLUP_VK_INDEX,
            1,
            checkpoint_index,
            false,
        )
    }

    pub fn new(
        left_rollup_vk_index: u32,
        num_left_blocks: u32,
        right_rollup_vk_index: u32,
        num_right_blocks: u32,
    ) -> Self {
        Self::new_with_random_blob_fields(
            left_rollup_vk_index,
            num_left_blocks,
            right_rollup_vk_index,
            num_right_blocks,
            2,
            false,
        )
    }

    pub fn new_single_block(vk_index: u32) -> Self {
        Self::new_with_random_blob_fields(vk_index, 1, 0, 0, 1, true)
    }

    fn new_with_random_blob_fields(
        left_rollup_vk_index: u32,
        num_left_blocks: u32,
        right_rollup_vk_index: u32,
        num_right_blocks: u32,
        checkpoint_index: u32,
        is_single_block: bool,
    ) -> Self {
        let blob_fields_without_end_marker: [Field; 11] = make_fixture(89243);
        Self::new_with_blob_fields(
            left_rollup_vk_index,
            num_left_blocks,
            right_rollup_vk_index,
            num_right_blocks,
            blob_fields_without_end_marker.concat([create_checkpoint_end_marker(12)]),
            checkpoint_index,
            is_single_block,
        )
    }

    fn new_with_blob_fields<let BlobFieldsLen: u32>(
        left_rollup_vk_index: u32,
        num_left_blocks: u32,
        right_rollup_vk_index: u32,
        num_right_blocks: u32,
        blob_fields: [Field; BlobFieldsLen],
        checkpoint_index: u32,
        is_single_block: bool,
    ) -> Self {
        Self::validate_input_vk_index(left_rollup_vk_index, num_left_blocks);
        if !is_single_block {
            Self::validate_input_vk_index(right_rollup_vk_index, num_right_blocks);
        }

        let mut fixture_builder = RollupFixtureBuilder::new();

        let slot_number = fixture_builder.start_slot_number + checkpoint_index as Field;
        fixture_builder.end_slot_number = slot_number + 1;

        let start_block_number = fixture_builder.start_block_number;
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
        // Restore the start_block_number to the original value.
        fixture_builder.start_block_number = start_block_number;

        left_rollup.start_sponge_blob = SpongeBlob::init();

        // Safety: This is just for testing. Unconstrained to speed up the tests.
        let (previous_archive, end_sponge_blob, hints) =
            unsafe { Self::build_hints(slot_number, blob_fields, fixture_builder) };

        left_rollup.previous_archive = previous_archive;

        if is_single_block {
            left_rollup.end_sponge_blob = end_sponge_blob;
        } else {
            right_rollup.end_sponge_blob = end_sponge_blob;
        }

        // Update the start state of the left rollup to match the state of the previous block.
        left_rollup.start_state = hints.previous_block_header.state;

        // The parity root commits to the same checkpoint messages the block roots absorbed. Its message sponge (empty
        // to the checkpoint's accumulated value) matches the blocks' merged sponge; its rolling hash / sha root feed
        // the checkpoint header. Built at the base slot the block fixtures use for their sponge.
        let parity_root = fixture_builder.get_parity_public_inputs(fixture_builder.start_slot_number);

        Self {
            fixture_builder,
            left_rollup,
            left_rollup_vk_index,
            right_rollup,
            right_rollup_vk_index,
            parity_root,
            parity_root_vk_index: PARITY_ROOT_VK_INDEX,
            hints,
            is_single_block,
        }
    }

    unconstrained fn build_hints<let BlobFieldsLen: u32>(
        slot_number: Field,
        blob_fields: [Field; BlobFieldsLen],
        fixture_builder: RollupFixtureBuilder,
    ) -> (AppendOnlyTreeSnapshot, SpongeBlob, CheckpointRootRollupHints) {
        let (previous_out_hash, new_out_hash_sibling_path) =
            fixture_builder.build_out_hash_tree_for_insertion(slot_number);

        // Generate the `end_sponge_blob` for the child rollup that absorbs the blob fields.
        // Except for the last field (the checkpoint end marker), which will be absorbed in the composer.
        let mut end_sponge_blob = SpongeBlob::init();
        end_sponge_blob.absorb(blob_fields, blob_fields.len() - 1);

        let start_blob_accumulator = fixture_builder.get_blob_accumulator(slot_number - 1);
        let final_blob_challenges = fixture_builder.get_final_blob_challenges();
        let blob_commitments = fixture_builder.get_blob_commitments(slot_number);

        // Rollback the start slot number to get the last block header of the previous checkpoint.
        let mut previous_slot_fixture_builder = fixture_builder;
        previous_slot_fixture_builder.start_slot_number -= 1;
        let start_block_number = previous_slot_fixture_builder.start_block_number;
        let previous_block_number = start_block_number - 1;
        let previous_block_header =
            previous_slot_fixture_builder.get_block_header(previous_block_number);
        // Build the archive tree to include the previous header hash.
        let (previous_archive, previous_archive_sibling_path) =
            previous_slot_fixture_builder.build_archive_tree(previous_block_number);

        let hints = CheckpointRootRollupHints {
            previous_block_header,
            previous_archive_sibling_path,
            previous_out_hash,
            new_out_hash_sibling_path,
            start_blob_accumulator,
            final_blob_challenges,
            blobs_fields: pad_end(blob_fields),
            blob_commitments,
            blobs_hash: slot_number + 9325034,
        };

        (previous_archive, end_sponge_blob, hints)
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
                    | (vk_index == BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX)
                    | (vk_index == BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX),
            );
        }
    }

    pub fn execute(self) -> CheckpointRollupPublicInputs {
        let parity_root =
            RollupFixtureBuilder::make_proof_data(self.parity_root, self.parity_root_vk_index);

        if self.is_single_block {
            checkpoint_root_single_block_rollup::execute(
                CheckpointRootSingleBlockRollupPrivateInputs {
                    previous_rollup: RollupFixtureBuilder::make_proof_data(
                        self.left_rollup,
                        self.left_rollup_vk_index,
                    ),
                    parity_root,
                    hints: self.hints,
                },
            )
        } else {
            checkpoint_root_rollup::execute(
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
                    parity_root,
                    hints: self.hints,
                },
            )
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
            self.fixture_builder.get_blob_accumulator(self.fixture_builder.end_slot_number);

        let evaluate_blobs_and_batch_mock =
            OracleMock::mock("evaluateBlobs").returns(end_blob_accumulator_mock.serialize());

        (self.execute(), evaluate_blobs_and_batch_mock)
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

        // The checkpoint's rolling-hash pair is sourced from the parity root (which commits to the checkpoint's full
        // message list), not from the block rollups.
        assert_eq(pi.start_inbox_rolling_hash, self.parity_root.start_rolling_hash);
        assert_eq(pi.end_inbox_rolling_hash, self.parity_root.end_rolling_hash);

        // Safety: This is just for testing. Unconstrained to speed up the tests.
        let expected_checkpoint_header = unsafe { self.get_expected_checkpoint_header() };
        assert_array_eq(
            pi.checkpoint_header_hashes,
            [expected_checkpoint_header.hash()],
        );

        assert_eq(pi.new_out_hash.root, expected_checkpoint_header.epoch_out_hash);
        assert_eq(
            pi.new_out_hash.next_available_leaf_index,
            self.hints.previous_out_hash.next_available_leaf_index + 1,
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

    unconstrained fn get_expected_checkpoint_header(self) -> CheckpointHeader {
        let left = self.left_rollup;
        let right = if self.is_single_block {
            self.left_rollup
        } else {
            self.right_rollup
        };

        let block_headers_hash = if self.is_single_block {
            left.block_headers_hash
        } else {
            accumulate_block_headers_hash(left.block_headers_hash, right.block_headers_hash)
        };

        let total_mana_used = if self.is_single_block {
            left.accumulated_mana_used
        } else {
            left.accumulated_mana_used + right.accumulated_mana_used
        };

        let accumulated_fees = if self.is_single_block {
            left.accumulated_fees
        } else {
            left.accumulated_fees + right.accumulated_fees
        };

        let out_hash = if self.is_single_block {
            left.out_hash
        } else {
            accumulate_out_hash(left.out_hash, right.out_hash)
        };
        let mut out_hashes = [0; OUT_HASH_TREE_LEAF_COUNT];
        let checkpoint_index = self.hints.previous_out_hash.next_available_leaf_index as u32;
        for i in 0..OUT_HASH_TREE_LEAF_COUNT {
            if i < checkpoint_index {
                out_hashes[i] = self.fixture_builder.get_out_hash(
                    i + self.fixture_builder.start_slot_number as u32,
                );
            }
        }
        out_hashes[checkpoint_index] = out_hash;
        let epoch_out_hash = compute_sha_tree_root(out_hashes);

        CheckpointHeader {
            last_archive_root: left.previous_archive.root,
            block_headers_hash,
            blobs_hash: self.hints.blobs_hash,
            in_hash: self.parity_root.sha_root,
            inbox_rolling_hash: self.parity_root.end_rolling_hash,
            epoch_out_hash,
            slot_number: left.constants.slot_number,
            timestamp: right.timestamp,
            coinbase: left.constants.coinbase,
            fee_recipient: left.constants.fee_recipient,
            gas_fees: left.constants.gas_fees,
            total_mana_used,
            accumulated_fees,
        }
    }
}
