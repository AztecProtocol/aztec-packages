use dep::std;

// This test is used to generate artifacts for the compiler `integration-tests`
fn main(
    verification_key: [Field; 114],
    proof: [Field; 93],
    public_inputs: [Field; 1],
    key_hash: Field
) {
    std::verify_proof(
        verification_key.as_slice(),
        proof.as_slice(),
        public_inputs.as_slice(),
        key_hash
    )
}
