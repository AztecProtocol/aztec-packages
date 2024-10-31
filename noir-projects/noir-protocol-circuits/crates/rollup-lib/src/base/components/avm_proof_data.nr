use dep::types::{
    abis::kernel_circuit_public_inputs::vm_circuit_public_inputs::VMCircuitPublicInputs,
    constants::AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
};

pub struct AvmProofData {
    public_inputs: VMCircuitPublicInputs,
    proof: AvmProof,
    vk_data: VkData<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for AvmProofData {
    fn verify(self) {
        // TODO(#8470)
    }
}
