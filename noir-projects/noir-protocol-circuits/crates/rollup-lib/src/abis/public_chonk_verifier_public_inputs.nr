use types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    traits::{Deserialize, Empty, Serialize},
};

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
#[derive(Deserialize, Eq, Serialize)]
pub struct PublicChonkVerifierPublicInputs {
    pub private_tail: PrivateToPublicKernelCircuitPublicInputs,
    pub prover_id: Field,
}

impl Empty for PublicChonkVerifierPublicInputs {
    fn empty() -> Self {
        PublicChonkVerifierPublicInputs {
            private_tail: PrivateToPublicKernelCircuitPublicInputs::empty(),
            prover_id: 0,
        }
    }
}
