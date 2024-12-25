use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use dep::types::{
    constants::{PROOF_TYPE_ROLLUP_HONK, VK_TREE_HEIGHT},
    merkle_tree::{membership::assert_check_membership, MembershipWitness},
    proof::{
        rollup_recursive_proof::NestedRecursiveProof,
        traits::Verifiable,
        verification_key::{RollupHonkVerificationKey, VerificationKey},
    },
    traits::Empty,
    utils::arrays::find_index_hint,
};

pub struct PreviousRollupBlockData {
    pub block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs,
    pub proof: NestedRecursiveProof,
    pub vk: RollupHonkVerificationKey,
    pub vk_witness: MembershipWitness<VK_TREE_HEIGHT>,
}

impl Verifiable for PreviousRollupBlockData {
    fn verify(self) {
        let inputs = BlockRootOrBlockMergePublicInputs::serialize(
            self.block_root_or_block_merge_public_inputs,
        );
        std::verify_proof_with_type(
            self.vk.key,
            self.proof.fields,
            inputs,
            self.vk.hash,
            PROOF_TYPE_ROLLUP_HONK,
        );
    }
}

impl Empty for PreviousRollupBlockData {
    fn empty() -> Self {
        PreviousRollupBlockData {
            block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs::empty(),
            proof: NestedRecursiveProof::empty(),
            vk: VerificationKey::empty(),
            vk_witness: MembershipWitness::empty(),
        }
    }
}

impl PreviousRollupBlockData {
    pub fn validate_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        self.vk.check_hash();

        let leaf_index = self.vk_witness.leaf_index as u32;
        let index_hint =
            unsafe { find_index_hint(allowed_indices, |index: u32| index == leaf_index) };
        assert(index_hint < N, "Invalid vk index");
        assert_eq(allowed_indices[index_hint], leaf_index, "Invalid vk index");

        assert_check_membership(
            self.vk.hash,
            self.vk_witness.leaf_index,
            self.vk_witness.sibling_path,
            self.block_root_or_block_merge_public_inputs.vk_tree_root,
        );
    }
}
