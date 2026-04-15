// This circuit aggregates two RollupHonk proofs from `assert_statement` at the root of a rollup
// aggregation tree: each inner verification defers its IPA claim, the two claims are accumulated
// into one, and the accumulated claim is then fully verified in-circuit. The outer circuit is
// therefore proved as a standard (non-rollup) UltraHonk - its proof carries no deferred IPA
// material and is verifiable by `verify_honk_proof_non_zk` / `verify_honk_proof`.
use bb_proof_verification::{RollupHonkProof, RollupHonkVerificationKey, verify_root_rolluphonk_proof};

fn main(
    verification_key: RollupHonkVerificationKey,
    // This is the proof without public inputs attached.
    // This means: the size of this does not change with the number of public inputs.
    proof: RollupHonkProof,
    public_inputs: pub [Field; 1],
    // This is currently not public. It is fine given that the vk is a part of the circuit definition.
    // I believe we want to eventually make it public too though.
    key_hash: Field,
    // The second proof, currently set to be identical.
    proof_b: RollupHonkProof,
) {
    verify_root_rolluphonk_proof(verification_key, proof, public_inputs, key_hash);
    verify_root_rolluphonk_proof(verification_key, proof_b, public_inputs, key_hash);
}
