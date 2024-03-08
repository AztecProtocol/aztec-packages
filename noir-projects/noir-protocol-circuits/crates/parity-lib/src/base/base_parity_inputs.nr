use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{
    constants::NUM_FIELDS_PER_SHA256,
    mocked::AggregationObject,
};

global NUM_MSGS_PER_BASE_PARITY: Field = 4;

struct BaseParityInputs {
    msgs: [[Field; NUM_FIELDS_PER_SHA256]; NUM_MSGS_PER_BASE_PARITY],
}

impl BaseParityInputs {
    pub fn base_parity_circuit(self) -> ParityPublicInputs {
        // sha_root = MERKLE_TREE(inputs.msgs, SHA256);
        // converted_root = MERKLE_TREE(inputs.msgs, SNARK_FRIENDLY_HASH_FUNCTION);
        // return ParityPublicInputs(sha_root, converted_root)
        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: [0, 0],
            converted_root: 0,
        }
    }
}