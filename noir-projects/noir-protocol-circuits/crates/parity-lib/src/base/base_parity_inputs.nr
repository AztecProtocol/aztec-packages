use crate::{
    parity_public_inputs::ParityPublicInputs,
    utils::sha256_merkle_tree::Sha256MerkleTree,
};
use dep::types::{
    constants::NUM_FIELDS_PER_SHA256,
    merkle_tree::MerkleTree,
    mocked::AggregationObject,
};

global NUM_MSGS_PER_BASE_PARITY: u64 = 4;

struct BaseParityInputs {
    msgs: [[Field; NUM_FIELDS_PER_SHA256]; NUM_MSGS_PER_BASE_PARITY],
}

impl BaseParityInputs {
    pub fn base_parity_circuit(self) -> ParityPublicInputs {
        let sha_tree = Sha256MerkleTree::new(self.msgs);

        // TODO: nuke this flattening once we truncate sha256 to 1 field
        let mut flat_msgs = [0; NUM_FIELDS_PER_SHA256 * NUM_MSGS_PER_BASE_PARITY];
        for i in 0..NUM_MSGS_PER_BASE_PARITY {
            for j in 0..NUM_FIELDS_PER_SHA256 {
                flat_msgs[i * NUM_FIELDS_PER_SHA256 + j] = self.msgs[i][j];
            }
        }
        let pedersen_tree = MerkleTree::new(flat_msgs);

        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: sha_tree.get_root(),
            converted_root: pedersen_tree.get_root(),
        }
    }
}