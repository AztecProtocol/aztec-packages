use types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicTubePublicInputs {
    pub private_tail: PrivateToPublicKernelCircuitPublicInputs,
    pub prover_id: Field,
}

impl Empty for PublicTubePublicInputs {
    fn empty() -> Self {
        PublicTubePublicInputs {
            private_tail: PrivateToPublicKernelCircuitPublicInputs::empty(),
            prover_id: 0,
        }
    }
}
