use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs},
    checkpoint_root::{
        checkpoint_root_rollup_private_inputs::CheckpointRootRollupHints,
        components::{CheckpointRollupPublicInputsComposer, CheckpointRootInputsValidator},
    },
};
use types::{
    constants::{
        BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

// If there's only one previous rollup (i.e., one block in the checkpoint), it must be the first block root rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
];

pub struct CheckpointRootSingleBlockRollupPrivateInputs {
    pub(crate) previous_rollup: RollupHonkProofData<BlockRollupPublicInputs>,
    pub(crate) hints: CheckpointRootRollupHints,
}

impl CheckpointRootSingleBlockRollupPrivateInputs {
    /// VkIndex: CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX
    pub fn execute(self) -> CheckpointRollupPublicInputs {
        let hints = self.hints;
        CheckpointRootInputsValidator::new(
            [self.previous_rollup],
            ALLOWED_PREVIOUS_VK_INDICES,
            hints.previous_block_header,
            hints.previous_archive_sibling_path,
        )
            .validate();

        CheckpointRollupPublicInputsComposer::new(
            [self.previous_rollup.public_inputs],
            hints.start_blob_accumulator,
            hints.final_blob_challenges,
            hints.blobs_fields,
            hints.blob_commitments,
            hints.blobs_hash,
        )
            .finish()
    }
}
