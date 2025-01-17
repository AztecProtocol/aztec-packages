use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
        block_root_or_block_merge_public_inputs::{BlockRootOrBlockMergePublicInputs, FeeRecipient},
        block_root_rollup_data::BlockRootRollupData,
    },
    merge::utils::merge_rollups::merge_rollups,
};
use blob::{blob::evaluate_blobs, blob_public_inputs::BlockBlobPublicInputs};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, constant_rollup_data::ConstantRollupData,
    },
    block_header::BlockHeader,
    constants::{AZTEC_MAX_EPOCH_DURATION, L1_TO_L2_MSG_SUBTREE_HEIGHT},
    content_commitment::ContentCommitment,
    merkle_tree::{append_only_tree, calculate_empty_tree_root},
    partial_state_reference::PartialStateReference,
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

    pub fn finish(self) -> BlockRootOrBlockMergePublicInputs {
        let constants = self.merged_rollup.constants;

        // Build the block hash for this by hashing the header and then insert the new leaf to archive tree.
        let block_hash = self.compute_block_hash(constants, self.merged_rollup.end);
        let new_archive = self.update_archive(constants.last_archive, block_hash);

        let fees = self.get_fees();

        let blob_public_inputs = self.get_blob_public_inputs();

        BlockRootOrBlockMergePublicInputs {
            previous_archive: constants.last_archive, // archive before this block was added
            new_archive, // archive once this block was added
            previous_block_hash: self.data.previous_block_hash,
            end_block_hash: block_hash, // current newest block hash = this block hash
            start_global_variables: constants.global_variables, // we have asserted that left.constants == right.constants => ...
            end_global_variables: constants.global_variables, // ...with a current block range of 1, we only have 1 set of constants
            out_hash: self.merged_rollup.out_hash,
            fees,
            vk_tree_root: constants.vk_tree_root,
            protocol_contract_tree_root: constants.protocol_contract_tree_root,
            prover_id: self.data.prover_id,
            blob_public_inputs,
        }
    }

    pub fn finish_empty(
        self,
        constants: ConstantRollupData,
        previous_partial_state: PartialStateReference,
        challenge_z: Field,
        is_padding: bool,
    ) -> BlockRootOrBlockMergePublicInputs {
        // Build the block hash for this by hashing the header and then insert the new leaf to archive tree.
        let block_hash = if is_padding {
            self.data.previous_block_hash
        } else {
            self.compute_block_hash(constants, previous_partial_state)
        };

        let new_archive = if is_padding {
            constants.last_archive
        } else {
            self.update_archive(constants.last_archive, block_hash)
        };

        let fees = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];

        let mut blob_public_inputs = [BlockBlobPublicInputs::empty(); AZTEC_MAX_EPOCH_DURATION];
        if !is_padding {
            blob_public_inputs[0].inner[0].z = challenge_z;
            blob_public_inputs[0].inner[0].kzg_commitment = self.data.blob_commitments[0];
        };

        BlockRootOrBlockMergePublicInputs {
            previous_archive: constants.last_archive, // archive before this block was added
            new_archive, // archive once this block was added
            previous_block_hash: self.data.previous_block_hash,
            end_block_hash: block_hash, // current newest block hash = this block hash
            start_global_variables: constants.global_variables, // we have asserted that left.constants == right.constants => ...
            end_global_variables: constants.global_variables, // ...with a current block range of 1, we only have 1 set of constants
            out_hash: 0,
            fees,
            vk_tree_root: constants.vk_tree_root,
            protocol_contract_tree_root: constants.protocol_contract_tree_root,
            prover_id: self.data.prover_id,
            blob_public_inputs,
        }
    }

    fn compute_block_hash(
        self,
        constants: ConstantRollupData,
        end_partial_state: PartialStateReference,
    ) -> Field {
        let content_commitment = ContentCommitment {
            num_txs: self.merged_rollup.num_txs as Field,
            blobs_hash: self.data.blobs_hash,
            in_hash: self.data.l1_to_l2_roots.public_inputs.sha_root,
            out_hash: self.merged_rollup.out_hash,
        };

        // Insert subtree into the l1 to l2 data tree
        let empty_l1_to_l2_subtree_root = calculate_empty_tree_root(L1_TO_L2_MSG_SUBTREE_HEIGHT);
        let new_l1_to_l2_message_tree_snapshot = append_only_tree::insert_subtree_to_snapshot_tree(
            self.data.start_l1_to_l2_message_tree_snapshot,
            self.data.l1_to_l2_message_subtree_sibling_path,
            empty_l1_to_l2_subtree_root,
            self.data.l1_to_l2_roots.public_inputs.converted_root,
            L1_TO_L2_MSG_SUBTREE_HEIGHT as u8,
        );
        let state = StateReference {
            l1_to_l2_message_tree: new_l1_to_l2_message_tree_snapshot,
            partial: end_partial_state,
        };

        let header = BlockHeader {
            last_archive: constants.last_archive,
            content_commitment,
            state,
            global_variables: constants.global_variables,
            total_fees: self.merged_rollup.accumulated_fees,
            total_mana_used: self.merged_rollup.accumulated_mana_used,
        };

        header.hash()
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

    fn get_fees(self) -> [FeeRecipient; AZTEC_MAX_EPOCH_DURATION] {
        let mut arr = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];
        arr[0] = FeeRecipient {
            recipient: self.merged_rollup.constants.global_variables.coinbase,
            value: self.merged_rollup.accumulated_fees,
        };
        arr
    }

    fn get_blob_public_inputs(self) -> [BlockBlobPublicInputs; AZTEC_MAX_EPOCH_DURATION] {
        let mut blob_public_inputs = [BlockBlobPublicInputs::empty(); AZTEC_MAX_EPOCH_DURATION];
        if !dep::std::runtime::is_unconstrained() {
            blob_public_inputs[0] = evaluate_blobs(
                self.data.blobs_fields,
                self.data.blob_commitments,
                self.merged_rollup.end_sponge_blob,
            );
        } else {
            /// Safety: TODO(#10323): this was added to save simulation time, if/when simulation times of unconstrained are improved, remove this.
            blob_public_inputs[0] = unsafe {
                blob::mock_blob_oracle::evaluate_blobs(
                    self.data.blobs_fields,
                    self.data.blob_commitments,
                    self.merged_rollup.end_sponge_blob,
                )
            };
        }
        blob_public_inputs
    }
}
