use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use types::{abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables}};
use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;

pub struct EmptyBlockRootRollupInputs {
    archive: AppendOnlyTreeSnapshot,
    block_hash: Field,
    global_variables: GlobalVariables,
    out_hash: Field,
    vk_tree_root: Field,
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
            out_hash: self.out_hash,
            fees: [FeeRecipient::empty(); 32],
            vk_tree_root: self.vk_tree_root,
            prover_id: self.prover_id
        }
    }
}

