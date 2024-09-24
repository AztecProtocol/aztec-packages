
// This circuit aggregates a single Honk proof from `assert_statement_recursive`.
global RECURSIVE_OINK_PROOF_LENGTH : u32 = 115;
global OINK_IDENTIFIER : u32 = 2;
fn main(
    verification_key: [Field; 128],
    // This is the proof without public inputs attached.
    //
    // This means: the size of this does not change with the number of public inputs.
    proof: [Field; RECURSIVE_OINK_PROOF_LENGTH],
    public_inputs: pub [Field; 1],
    // This is currently not public. It is fine given that the vk is a part of the circuit definition.
    // I believe we want to eventually make it public too though.
    key_hash: Field
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        OINK_IDENTIFIER
    );
}
