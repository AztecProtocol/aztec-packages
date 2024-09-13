use dep::types::constants::{AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, AVM_PROOF_LENGTH_IN_FIELDS};

fn main(
    verification_key: [Field; AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS],
    proof: [Field; AVM_PROOF_LENGTH_IN_FIELDS]
) {
    std::verify_proof_with_type(verification_key, proof, [], 0, std::PROOF_TYPE_AVM);
}
