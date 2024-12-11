use crate::{
    abis::kernel_circuit_public_inputs::{
        KernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
    },
    constants::HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{traits::Verifiable, tube_proof::TubeProof, vk_data::VkData},
};

pub struct PublicTubeData {
    pub public_inputs: PrivateToPublicKernelCircuitPublicInputs,
    pub proof: TubeProof,
    pub vk_data: VkData<HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PublicTubeData {
    fn verify(self) {
        let inputs = PrivateToPublicKernelCircuitPublicInputs::serialize(self.public_inputs);
        std::verify_proof(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
        );
    }
}

pub struct PrivateTubeData {
    pub public_inputs: KernelCircuitPublicInputs,
    proof: TubeProof,
    vk_data: VkData<HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PrivateTubeData {
    fn verify(self) {
        let inputs = KernelCircuitPublicInputs::serialize(self.public_inputs);
        std::verify_proof(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
        );
    }
}
