use dep::types::mocked::Proof;
use crate::parity_public_inputs::ParityPublicInputs;

struct RootParityInput {
    proof: Proof,
    public_inputs: ParityPublicInputs,
}

impl Default for RootParityInput {
    fn default() -> Self {
        RootParityInput {
            proof: Proof::default(),
            public_inputs: ParityPublicInputs::default(),
        }
    }
}
