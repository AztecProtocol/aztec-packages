use mock_types::{
    AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AvmCircuitPublicInputs, ChonkProofData, PROOF_TYPE_AVM,
    RollupPublicInputs, SerializeToColumns,
};

fn main(
    chonk_proof_data: ChonkProofData,
    proof: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
    public_inputs: AvmCircuitPublicInputs,
) -> pub RollupPublicInputs {
    chonk_proof_data.verify();
    std::verify_proof_with_type(
        [], // Unused, hardcoded inside the verifier
        proof,
        public_inputs.serialize_to_columns(),
        0, // Unused, hardcoded inside the verifier
        PROOF_TYPE_AVM,
    );
    RollupPublicInputs::new(1)
}
