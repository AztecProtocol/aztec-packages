use crate::abis::{
    block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
    block_root_rollup_data::BlockRootRollupData,
};
use types::merkle_tree::membership::check_membership;

pub struct BlockRootRollupOutputValidator {
    output: BlockRootOrBlockMergePublicInputs,
    data: BlockRootRollupData,
}

impl BlockRootRollupOutputValidator {
    pub fn new(output: BlockRootOrBlockMergePublicInputs, data: BlockRootRollupData) -> Self {
        BlockRootRollupOutputValidator { output, data }
    }

    pub fn validate(self) {
        // This is checked here instead of in the inputs validator because the previous block hash is computed in the output composer.
        self.validate_previous_block_hash();
    }

    fn validate_previous_block_hash(self) {
        // Make sure the previous block hash is the last leaf in the previous archive.
        let previous_archive = self.output.previous_archive;
        assert(previous_archive.next_available_leaf_index != 0, "archive can't be empty");
        let last_leaf_index = previous_archive.next_available_leaf_index - 1;

        assert(
            check_membership(
                self.output.previous_block_hash,
                last_leaf_index as Field,
                self.data.last_archive_sibling_path,
                previous_archive.root,
            ),
            "previous block hash does not match the last leaf in the archive tree",
        );
    }
}
