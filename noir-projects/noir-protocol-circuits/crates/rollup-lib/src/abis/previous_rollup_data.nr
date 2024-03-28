use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use dep::types::abis::membership_witness::VKMembershipWitness;
use dep::types::constants::ROLLUP_VK_TREE_HEIGHT;
use dep::types::mocked::{Proof, VerificationKey};

struct PreviousRollupData{
    base_or_merge_rollup_public_inputs : BaseOrMergeRollupPublicInputs,
    proof : Proof,
    vk : VerificationKey,
    vk_index : u32,
    vk_sibling_path : VKMembershipWitness,
}

impl Default for PreviousRollupData {
    fn default() -> Self {
        PreviousRollupData {
            base_or_merge_rollup_public_inputs: dep::std::unsafe::zeroed(),
            proof : Proof::default(),
            vk : VerificationKey::default(),
            vk_index : 0 as u32,
            vk_sibling_path : VKMembershipWitness::default(),
        }
    }
}
