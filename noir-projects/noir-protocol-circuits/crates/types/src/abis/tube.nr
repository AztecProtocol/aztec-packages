use crate::{
    abis::kernel_circuit_public_inputs::{
        PrivateToPublicKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
    },
    constants::{
        PRIVATE_TUBE_VK_INDEX, PROOF_TYPE_ROLLUP_HONK, PUBLIC_TUBE_VK_INDEX,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    },
    proof::{traits::Verifiable, tube_proof::TubeProof, vk_data::VkData},
    traits::Serialize,
};

pub struct PublicTubeData {
    pub public_inputs: PrivateToPublicKernelCircuitPublicInputs,
    pub proof: TubeProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PublicTubeData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    fn verify(self) {
        let inputs = PrivateToPublicKernelCircuitPublicInputs::serialize(self.public_inputs);
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
            PROOF_TYPE_ROLLUP_HONK,
        );
    }
}

impl PublicTubeData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree(self) {
        assert_eq(self.vk_data.leaf_index, PUBLIC_TUBE_VK_INDEX);
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(self.public_inputs.constants.vk_tree_root);
    }
}

pub struct PrivateTubeData {
    pub public_inputs: PrivateToRollupKernelCircuitPublicInputs,
    pub proof: TubeProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PrivateTubeData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    fn verify(self) {
        let inputs = PrivateToRollupKernelCircuitPublicInputs::serialize(self.public_inputs);
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
            PROOF_TYPE_ROLLUP_HONK,
        );
    }
}

impl PrivateTubeData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree(self) {
        assert_eq(self.vk_data.leaf_index, PRIVATE_TUBE_VK_INDEX);
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(self.public_inputs.constants.vk_tree_root);
    }
}
