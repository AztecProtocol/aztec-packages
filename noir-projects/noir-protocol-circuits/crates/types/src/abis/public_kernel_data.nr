use crate::{
    abis::kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
    constants::{TUBE_VK_INDEX, VK_TREE_HEIGHT},
    merkle_tree::membership::check_membership,
    proof::{
        recursive_proof::NestedRecursiveProof, traits::Verifiable,
        verification_key::HonkVerificationKey,
    },
    utils::arrays::find_index_hint,
};

pub struct PublicKernelData {
    public_inputs: PublicKernelCircuitPublicInputs,
    proof: NestedRecursiveProof,
    vk: HonkVerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}

impl Verifiable for PublicKernelData {
    fn verify(self) {
        let inputs = PublicKernelCircuitPublicInputs::serialize(self.public_inputs);
        std::verify_proof(self.vk.key, self.proof.fields, inputs, self.vk.hash);
    }
}

impl PublicKernelData {
    fn validate_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        self.vk.check_hash();

        let index_hint =
            unsafe { find_index_hint(allowed_indices, |index: u32| index == self.vk_index) };
        assert(index_hint < N, "Invalid vk index");
        assert_eq(allowed_indices[index_hint], self.vk_index, "Invalid vk index");

        // TODO(#7410) Remove the exception for the tube index
        assert(
            check_membership(
                self.vk.hash,
                self.vk_index as Field,
                self.vk_path,
                self.public_inputs.constants.vk_tree_root,
            )
                | (self.vk_index == TUBE_VK_INDEX),
        );
    }
}
