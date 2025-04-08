use dep::types::constants::{
        AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE,
    AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED, PROOF_TYPE_AVM,,
};

use dep::mock_types::{RollupPublicInputs, TubeData};

fn main(
    tube_data: TubeData,
    verification_key: [Field; AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS],
    proof: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS],
    pub_cols_flattened: [Field; AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE],
) -> pub RollupPublicInputs {
    tube_data.verify();
    std::verify_proof_with_type(
        verification_key,
        proof,
        pub_cols_flattened,
        0,
        PROOF_TYPE_AVM,
    );
    RollupPublicInputs::new(1)
}
