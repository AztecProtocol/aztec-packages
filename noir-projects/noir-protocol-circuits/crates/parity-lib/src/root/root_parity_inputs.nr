use dep::types::{
    constants::NUM_FIELDS_PER_SHA256,
    merkle_tree::MerkleTree,
    mocked::AggregationObject,
};
use crate::{
    parity_public_inputs::ParityPublicInputs,
    root::root_parity_input::RootParityInput,
    utils::sha256_merkle_tree::Sha256MerkleTree,
};

global NUM_BASE_PARITY_PER_ROOT_PARITY: u64 = 4;

struct RootParityInputs {
    children: [RootParityInput; NUM_BASE_PARITY_PER_ROOT_PARITY],
}

impl RootParityInputs {
    pub fn root_parity_circuit(self) -> ParityPublicInputs {
        // TODO: verify proofs of inputs.children

        let mut sha_roots = [[0; NUM_FIELDS_PER_SHA256]; NUM_BASE_PARITY_PER_ROOT_PARITY];
        let mut converted_roots = [0; NUM_BASE_PARITY_PER_ROOT_PARITY];
        for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
            sha_roots[i] = self.children[i].public_inputs.sha_root;
            converted_roots[i] = self.children[i].public_inputs.converted_root;
        }

        let sha_tree = Sha256MerkleTree::new(sha_roots);
        let pedersen_tree = MerkleTree::new(converted_roots);

        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: sha_tree.get_root(),
            converted_root: pedersen_tree.get_root(),
        }
    }
}