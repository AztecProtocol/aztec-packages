use ::rollup_lib::tx_base::{
    public_chonk_verifier, PublicChonkVerifierPrivateInputs, PublicChonkVerifierPublicInputs,
};

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
fn main(inputs: PublicChonkVerifierPrivateInputs) -> pub PublicChonkVerifierPublicInputs {
    public_chonk_verifier::execute(inputs)
}
