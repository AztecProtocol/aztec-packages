use dep::types::constants::{
    AVM_PROOF_LENGTH_IN_FIELDS, AVM_PUBLIC_INPUTS_FLATTENED_SIZE,
    AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, PROOF_TYPE_AVM,
};

fn main(
    verification_key: [Field; AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS],
    proof: [Field; AVM_PROOF_LENGTH_IN_FIELDS],
    pub_cols_flattened: [Field; AVM_PUBLIC_INPUTS_FLATTENED_SIZE],
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
