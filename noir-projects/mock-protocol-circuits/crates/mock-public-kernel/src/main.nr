fn main(verification_key: [Field; 66], proof: [Field; 3802]) {
    // PROOF_TYPE::AVM is defined in recursion_constraint.hpp to be 4
    // This enum should also be defined in noir.
    std::verify_proof_with_type(verification_key, proof, [], 0, 4);
}
