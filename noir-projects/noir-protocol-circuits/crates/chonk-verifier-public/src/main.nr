use dep::rollup_lib::tx_base::{PublicChonkVerifierPrivateInputs, PublicChonkVerifierPublicInputs};

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
fn main(inputs: PublicChonkVerifierPrivateInputs) -> pub PublicChonkVerifierPublicInputs {
    inputs.execute()
}
