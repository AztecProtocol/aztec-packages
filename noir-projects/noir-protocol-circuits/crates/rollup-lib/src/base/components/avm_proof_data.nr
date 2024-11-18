use dep::types::{
    abis::avm_circuit_public_inputs::AvmCircuitPublicInputs,
    constants::AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
};

pub struct AvmProofData {
    public_inputs: AvmCircuitPublicInputs,
    proof: AvmProof,
    vk_data: VkData<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for AvmProofData {
    fn verify(self) {
        // TODO(#8470)
    }
}
