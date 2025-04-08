use dep::types::constants::{
    AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE,
    AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED, PROOF_TYPE_AVM,
};

fn main(
    verification_key: [Field; AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED],
    proof: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
    pub_cols_flattened: [Field; AVM_V2_PUBLIC_INPUTS_FLATTENED_SIZE],
) -> pub u8 {
    std::verify_proof_with_type(
        verification_key,
        proof,
        pub_cols_flattened,
        0,
        PROOF_TYPE_AVM,
    );

    1 // Dummy value to return for the mock kernel as void function creates some pain.
}

// TODO(#13390): Migrate _PADDED constants by their non-padded counterparts
