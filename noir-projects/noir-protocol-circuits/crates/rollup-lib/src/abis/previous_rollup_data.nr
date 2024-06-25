use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use dep::types::{
    constants::VK_TREE_HEIGHT,
    recursion::{proof::NestedRecursiveProof, verification_key::VerificationKey, traits::Verifiable},
    traits::Empty, merkle_tree::MembershipWitness, merkle_tree::membership::assert_check_membership,
    utils::arrays::find_index_hint
};

struct PreviousRollupData{
    base_or_merge_rollup_public_inputs : BaseOrMergeRollupPublicInputs,
    proof : NestedRecursiveProof,
    vk : VerificationKey,
    vk_index : u32, // TODO(Alvaro) redundant with the witness, delete and rename to witness
    vk_sibling_path : MembershipWitness<VK_TREE_HEIGHT>,
}

impl Verifiable for PreviousRollupData {
  fn verify(self) {
    let inputs = BaseOrMergeRollupPublicInputs::serialize(self.base_or_merge_rollup_public_inputs);
    dep::std::verify_proof(
        self.vk.key.as_slice(),
        self.proof.fields.as_slice(),
        inputs.as_slice(),
        self.vk.hash
    );
  }
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

impl PreviousRollupData {
    fn validate_in_vk_tree<N>(self, allowed_indices: [u32; N]) {
        let index_hint = find_index_hint(allowed_indices, self.vk_index);
        assert_eq(allowed_indices[index_hint], self.vk_index, "Invalid vk index");

        assert_check_membership(
            self.vk.hash,
            self.vk_index as Field,
            self.vk_sibling_path.sibling_path,
            self.base_or_merge_rollup_public_inputs.constants.vk_tree_root
        );
    }
}
