use std::hash::poseidon;

// This circuit aggregates a single Honk proof from `assert_statement`.
global ULTRA_VK_SIZE: u32 = 128;
global ULTRA_PROOF_SIZE: u32 = 459;
global NUM_NON_ACCUMULATOR_PUBLIC_INPUTS: u32 = 1;
global HONK_IDENTIFIER: u32 = 1;
fn main(
    verification_key: [Field; ULTRA_VK_SIZE],
    proof: [Field; ULTRA_PROOF_SIZE],
    public_inputs: pub [Field; NUM_NON_ACCUMULATOR_PUBLIC_INPUTS],
    key_hash: Field,
    mut x: Field
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        HONK_IDENTIFIER,
    );

    for _ in 0..250 {
        x += poseidon::bn254::hash_1([x]);
    }

    // Make sure the hash value is used so it's not optimized away.
    assert(x != 0);
}
