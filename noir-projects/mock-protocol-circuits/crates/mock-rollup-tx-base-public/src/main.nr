use dep::mock_types::{
    AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
    AvmCircuitPublicInputs, PROOF_TYPE_AVM, RollupPublicInputs, TubeData, VerificationKey,
};

fn main(
    tube_data: TubeData,
    verification_key: VerificationKey<AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED>,
    proof: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
    public_inputs: AvmCircuitPublicInputs,
) -> pub RollupPublicInputs {
    tube_data.verify();
    std::verify_proof_with_type(
        verification_key.key,
        proof,
        public_inputs.to_columns_flat(),
        verification_key.hash,
        PROOF_TYPE_AVM,
    );
    RollupPublicInputs::new(1)
}
