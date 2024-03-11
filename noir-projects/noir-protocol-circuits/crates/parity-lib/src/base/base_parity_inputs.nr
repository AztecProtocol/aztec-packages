use crate::{
    parity_public_inputs::ParityPublicInputs,
    utils::sha256_merkle_tree::Sha256MerkleTree,
};
use dep::types::{
    constants::{NUM_FIELDS_PER_SHA256, NUM_MSGS_PER_BASE_PARITY},
    merkle_tree::MerkleTree,
    mocked::AggregationObject,
    utils::uint256::U256,
};

struct BaseParityInputs {
    msgs: [Field; NUM_MSGS_PER_BASE_PARITY],
}

impl BaseParityInputs {
    pub fn base_parity_circuit(self) -> ParityPublicInputs {
        // TODO: nuke this hack once we truncate the sha256 in the frontier tree
        let mut converted_msgs = [[0; NUM_FIELDS_PER_SHA256]; NUM_MSGS_PER_BASE_PARITY];
        for i in 0..NUM_MSGS_PER_BASE_PARITY {
            let bytes = self.msgs[i].to_be_bytes(32);
            let mut result = [0; 32];
            for i in 0..32 {
                result[i] = bytes[i];
            }
            let msg_as_u256 = U256::from_bytes32(result);
            converted_msgs[i] = msg_as_u256.to_u128_limbs();
        }

        let sha_tree = Sha256MerkleTree::new(converted_msgs);
        let pedersen_tree = MerkleTree::new(self.msgs);

        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: sha_tree.get_root(),
            converted_root: pedersen_tree.get_root(),
        }
    }
}