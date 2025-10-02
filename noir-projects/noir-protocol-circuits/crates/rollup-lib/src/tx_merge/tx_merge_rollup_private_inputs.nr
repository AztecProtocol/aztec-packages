use crate::{
    abis::TxRollupPublicInputs,
    tx_merge::utils::{
        merge_tx_rollups::merge_tx_rollups,
        validate_consecutive_tx_rollups::validate_consecutive_tx_rollups,
    },
};
use dep::types::{
    constants::{
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct TxMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
}

impl TxMergeRollupPrivateInputs {
    /// VkIndex: TX_MERGE_ROLLUP_VK_INDEX
    pub fn execute(self) -> TxRollupPublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollups[0].verify_proof();
            self.previous_rollups[1].verify_proof();
        }

        // Validate the vks.
        let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;
        self.previous_rollups[0].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            ALLOWED_PREVIOUS_CIRCUITS,
        );
        self.previous_rollups[1].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            ALLOWED_PREVIOUS_CIRCUITS,
        );

        // Validate the public inputs.
        let left = self.previous_rollups[0].public_inputs;
        let right = self.previous_rollups[1].public_inputs;
        validate_consecutive_tx_rollups(left, right);

        merge_tx_rollups(left, right)
    }
}
