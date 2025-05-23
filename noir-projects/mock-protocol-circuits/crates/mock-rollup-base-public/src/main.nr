use dep::types::{
    abis::avm_circuit_public_inputs::AvmCircuitPublicInputs,
    constants::{
        AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
        PROOF_TYPE_AVM,
    },
};

use dep::mock_types::{RollupPublicInputs, TubeData};

fn main(
    tube_data: TubeData,
    verification_key: [Field; AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED],
    proof: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
    public_inputs: AvmCircuitPublicInputs,
) -> pub RollupPublicInputs {
    tube_data.verify();
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs.to_columns_flat(),
        0,
        PROOF_TYPE_AVM,
    );
    RollupPublicInputs::new(1)
}
