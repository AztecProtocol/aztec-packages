use dep::types::{
    abis::kernel_circuit_public_inputs::KernelCircuitPublicInputs,
    constants::HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{traits::Verifiable, tube_proof::TubeProof, vk_data::VkData},
};

pub struct PrivateTubeData {
    public_inputs: KernelCircuitPublicInputs,
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
