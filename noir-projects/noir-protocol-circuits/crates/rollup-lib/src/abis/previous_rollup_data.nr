use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use dep::types::{
    constants::ROLLUP_VK_TREE_HEIGHT,
    recursion::{proof::NestedRecursiveProof, verification_key::VerificationKey}, traits::Empty,
    merkle_tree::MembershipWitness
};

struct PreviousRollupData{
    base_or_merge_rollup_public_inputs : BaseOrMergeRollupPublicInputs,
    proof : NestedRecursiveProof,
    vk : VerificationKey,
    vk_index : u32,
    vk_sibling_path : MembershipWitness<ROLLUP_VK_TREE_HEIGHT>,
}

fn verify_rollup_proof(previous_rollup_data: PreviousRollupData) {
    let inputs = BaseOrMergeRollupPublicInputs::serialize(previous_rollup_data.base_or_merge_rollup_public_inputs);
    dep::std::verify_proof(
        previous_rollup_data.vk.key.as_slice(),
        previous_rollup_data.proof.fields.as_slice(),
        inputs.as_slice(),
        previous_rollup_data.vk.hash
    );
}

impl Empty for PreviousRollupData {
    fn empty() -> Self {
        PreviousRollupData {
            base_or_merge_rollup_public_inputs: BaseOrMergeRollupPublicInputs::empty(),
            proof : NestedRecursiveProof::empty(),
            vk : VerificationKey::empty(),
            vk_index : 0 as u32,
            vk_sibling_path : MembershipWitness::empty(),
        }
    }
}
