use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
        block_root_or_block_merge_public_inputs::{BlockRootOrBlockMergePublicInputs, FeeRecipient},
        block_root_rollup_data::{BlockRootRollupBlobData, BlockRootRollupData},
    },
    merge::utils::merge_rollups::merge_rollups,
};
use blob::{
    blob_batching::evaluate_blobs_and_batch,
    blob_batching_public_inputs::{
        BlobAccumulationInputs, BlobAccumulatorPublicInputs, BlockBlobPublicInputs,
    },
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
        epoch_constant_data::EpochConstantData,
    },
    block_header::BlockHeader,
    constants::{AZTEC_MAX_EPOCH_DURATION, L1_TO_L2_MSG_SUBTREE_HEIGHT},
    content_commitment::ContentCommitment,
    merkle_tree::{append_only_tree, calculate_empty_tree_root},
    partial_state_reference::PartialStateReference,
    proposed_block_header::ProposedBlockHeader,
    state_reference::StateReference,
    traits::{Empty, Hash},
};

pub struct BlockRootRollupOutputComposer {
    merged_rollup: BaseOrMergeRollupPublicInputs,
    data: BlockRootRollupData,
}

impl BlockRootRollupOutputComposer {
    pub fn new_from_two_rollups(
        previous_rollups: [BaseOrMergeRollupPublicInputs; 2],
        data: BlockRootRollupData,
    ) -> Self {
        let merged_rollup = merge_rollups(previous_rollups[0], previous_rollups[1]);
        BlockRootRollupOutputComposer { merged_rollup, data }
    }

    pub fn new_from_single_tx_rollup(
        previous_rollup: BaseOrMergeRollupPublicInputs,
        data: BlockRootRollupData,
    ) -> Self {
        BlockRootRollupOutputComposer { merged_rollup: previous_rollup, data }
    }

    pub fn new_from_empty_rollup(data: BlockRootRollupData) -> Self {
        BlockRootRollupOutputComposer {
            merged_rollup: BaseOrMergeRollupPublicInputs::empty(),
            data,
        }
    }

    pub fn finish(self, blob_data: BlockRootRollupBlobData) -> BlockRootOrBlockMergePublicInputs {
        let constants = self.merged_rollup.constants;

        // Build the block hash for this by hashing the header and then insert the new leaf to archive tree.
        let new_block_header =
            self.create_new_block_header(constants, self.merged_rollup.end, blob_data.blobs_hash);
        let new_block_hash = new_block_header.hash();
        let new_archive = self.update_archive(constants.last_archive, new_block_hash);
        let proposed_block_header_hash = self.create_proposed_block_header(new_block_header).hash();

        let end_blob_accumulator = self.get_blob_accumulator_public_inputs(blob_data);

        self.finish_with_new_values(
            constants,
            new_archive,
            proposed_block_header_hash,
            self.merged_rollup.out_hash,
            self.data.start_blob_accumulator,
            end_blob_accumulator,
            self.merged_rollup.accumulated_fees,
        )
    }

    pub fn finish_empty(
        self,
        constants: BlockConstantData,
        empty_effect_blobs_hash: Field,
        empty_effect_blob_accumulation_input: BlobAccumulationInputs,
        is_padding: bool,
    ) -> BlockRootOrBlockMergePublicInputs {
        let (new_archive, proposed_block_header_hash) = if is_padding {
            (constants.last_archive, 0)
        } else {
            let new_block_header = self.create_new_block_header(
                constants,
                self.data.previous_block_header.state.partial,
                empty_effect_blobs_hash,
            );
            let new_block_hash = new_block_header.hash();
            (
                self.update_archive(constants.last_archive, new_block_hash),
                self.create_proposed_block_header(new_block_header).hash(),
            )
        };

        let end_blob_accumulator = if is_padding {
            self.data.start_blob_accumulator
        } else {
            if self.data.start_blob_accumulator.is_empty() {
                BlobAccumulatorPublicInputs::init(
                    empty_effect_blob_accumulation_input,
                    self.data.final_blob_challenges.gamma,
                )
            } else {
                self.data.start_blob_accumulator.accumulate(
                    empty_effect_blob_accumulation_input,
                    self.data.final_blob_challenges.gamma,
                )
            }
        };

        self.finish_with_new_values(
            constants,
            new_archive,
            proposed_block_header_hash,
            0 /* out_hash */,
            self.data.start_blob_accumulator,
            end_blob_accumulator,
            0, /* accumulated_fees */
        )
    }

    fn finish_with_new_values(
        self,
        constants: BlockConstantData,
        new_archive: AppendOnlyTreeSnapshot,
        proposed_block_header_hash: Field,
        out_hash: Field,
        start_blob_accumulator: BlobAccumulatorPublicInputs,
        end_blob_accumulator: BlobAccumulatorPublicInputs,
        accumulated_fees: Field,
    ) -> BlockRootOrBlockMergePublicInputs {
        let mut proposed_block_header_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        proposed_block_header_hashes[0] = proposed_block_header_hash;

        let mut fees = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];
        fees[0] = FeeRecipient {
            recipient: constants.global_variables.coinbase,
            value: accumulated_fees,
        };

        let blob_public_inputs = BlockBlobPublicInputs {
            start_blob_accumulator,
            end_blob_accumulator,
            final_blob_challenges: self.data.final_blob_challenges,
        };

        BlockRootOrBlockMergePublicInputs {
            constants: EpochConstantData {
                vk_tree_root: constants.vk_tree_root,
                protocol_contract_tree_root: constants.protocol_contract_tree_root,
                prover_id: self.data.prover_id,
            },
            previous_archive: constants.last_archive, // archive before this block was added
            new_archive, // archive once this block was added
            start_global_variables: constants.global_variables, // we have asserted that left.constants == right.constants => ...
            end_global_variables: constants.global_variables, // ...with a current block range of 1, we only have 1 set of constants
            out_hash,
            proposed_block_header_hashes,
            fees,
            blob_public_inputs,
        }
    }

    fn create_new_block_header(
        self,
        constants: BlockConstantData,
        end_partial_state: PartialStateReference,
        blobs_hash: Field,
    ) -> BlockHeader {
        let content_commitment = ContentCommitment {
            blobs_hash,
            in_hash: self.data.l1_to_l2_roots.public_inputs.sha_root,
            out_hash: self.merged_rollup.out_hash,
        };

        // Insert subtree into the l1 to l2 data tree
        let last_l1_to_l2_snapshot = self.data.previous_block_header.state.l1_to_l2_message_tree;
        let empty_l1_to_l2_subtree_root = calculate_empty_tree_root(L1_TO_L2_MSG_SUBTREE_HEIGHT);
        let new_l1_to_l2_message_tree_snapshot = append_only_tree::insert_subtree_to_snapshot_tree(
            last_l1_to_l2_snapshot,
            self.data.l1_to_l2_message_subtree_sibling_path,
            empty_l1_to_l2_subtree_root,
            self.data.l1_to_l2_roots.public_inputs.converted_root,
            L1_TO_L2_MSG_SUBTREE_HEIGHT as u8,
        );
        let state = StateReference {
            l1_to_l2_message_tree: new_l1_to_l2_message_tree_snapshot,
            partial: end_partial_state,
        };

        BlockHeader {
            last_archive: constants.last_archive,
            content_commitment,
            state,
            global_variables: constants.global_variables,
            total_fees: self.merged_rollup.accumulated_fees,
            total_mana_used: self.merged_rollup.accumulated_mana_used,
        }
    }

    fn create_proposed_block_header(_self: Self, block_header: BlockHeader) -> ProposedBlockHeader {
        ProposedBlockHeader {
            last_archive_root: block_header.last_archive.root,
            content_commitment: block_header.content_commitment,
            slot_number: block_header.global_variables.slot_number,
            timestamp: block_header.global_variables.timestamp,
            coinbase: block_header.global_variables.coinbase,
            fee_recipient: block_header.global_variables.fee_recipient,
            gas_fees: block_header.global_variables.gas_fees,
            total_mana_used: block_header.total_mana_used,
        }
    }

    fn update_archive(
        self,
        last_archive: AppendOnlyTreeSnapshot,
        block_hash: Field,
    ) -> AppendOnlyTreeSnapshot {
        append_only_tree::insert_subtree_to_snapshot_tree(
            last_archive,
            self.data.new_archive_sibling_path,
            0,
            block_hash,
            0,
        )
    }

    fn get_blob_accumulator_public_inputs(
        self,
        data: BlockRootRollupBlobData,
    ) -> BlobAccumulatorPublicInputs {
        if !dep::std::runtime::is_unconstrained() {
            evaluate_blobs_and_batch(
                data.blobs_fields,
                data.blob_commitments,
                self.merged_rollup.end_sponge_blob,
                self.data.final_blob_challenges,
                self.data.start_blob_accumulator,
            )
        } else {
            // Safety: TODO(#10323): this was added to save simulation time, if/when simulation times of unconstrained are improved, remove this.
            unsafe {
                blob::mock_blob_oracle::evaluate_blobs_and_batch(
                    data.blobs_fields,
                    data.blob_commitments,
                    self.merged_rollup.end_sponge_blob,
                    self.data.final_blob_challenges,
                    self.data.start_blob_accumulator,
                )
            }
        }
    }
}
