use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;
use types::abis::{
    append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables,
};
use types::constants::AZTEC_MAX_EPOCH_DURATION;

pub struct EmptyBlockRootRollupInputs {
    archive: AppendOnlyTreeSnapshot,
    block_hash: Field,
    global_variables: GlobalVariables,
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
    // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    prover_id: Field,
}

impl EmptyBlockRootRollupInputs {
    pub fn empty_block_root_rollup_circuit(self) -> BlockRootOrBlockMergePublicInputs {
        BlockRootOrBlockMergePublicInputs {
            previous_archive: self.archive,
            new_archive: self.archive,
            previous_block_hash: self.block_hash,
            end_block_hash: self.block_hash,
            start_global_variables: self.global_variables,
            end_global_variables: self.global_variables,
            out_hash: 0, // out_hash is ignored when merging if the block proof is padding
            fees: [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION],
            vk_tree_root: self.vk_tree_root,
            protocol_contract_tree_root: self.protocol_contract_tree_root,
            prover_id: self.prover_id,
        }
    }
}

