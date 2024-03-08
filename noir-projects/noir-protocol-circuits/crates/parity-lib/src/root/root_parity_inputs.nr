use dep::types::mocked::AggregationObject;
use crate::{
    parity_public_inputs::ParityPublicInputs,
    root::root_parity_input::RootParityInput,
};

struct RootParityInputs {
    children: [RootParityInput; 2],
}

impl RootParityInputs {
    pub fn root_parity_circuit(self) -> ParityPublicInputs {
        // for msg in inputs.children:
        //     assert msg.proof.verify(msg.public_inputs);

        // sha_root = MERKLE_TREE(
        // [msg.public_inputs.sha_root for msg in inputs.children], 
        // SHA256
        // );
        // converted_root = MERKLE_TREE(
        // [msg.public_inputs.converted_root for msg in inputs.children], 
        // SNARK_FRIENDLY_HASH_FUNCTION
        // );
        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: [0, 0],
            converted_root: 0,
        }
    }
}