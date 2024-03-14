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

        let sha_tree = Sha256MerkleTree::new(self.msgs);
        let pedersen_tree = MerkleTree::new(self.msgs);

        ParityPublicInputs {
            aggregation_object: AggregationObject {},
            sha_root: sha_tree.get_root(),
            converted_root: pedersen_tree.get_root(),
        }
    }
}

#[test]
fn test_sha_root_matches_frontier_tree() {
    // 31 byte msgs
    let msgs = [
      0x151de48ca3efbae39f180fe00b8f472ec9f25be10b4f283a87c6d783935370,
      0x14c2ea9dedf77698d4afe23bc663263eed0bf9aa3a8b17d9b74812f185610f,
      0x1570cc6641699e3ae87fa258d80a6d853f7b8ccb211dc244d017e2ca6530f8,
      0x2806c860af67e9cd50000378411b8c4c4db172ceb2daa862b259b689ccbdc1
    ];

    let base_parity_inputs = BaseParityInputs { msgs };
    let public_inputs = base_parity_inputs.base_parity_circuit();

    // 31 byte truncated root hash
    let expected_sha_root = 0x1fcbc929ace6acd25836c9779b04cd9d0965ac2b90dabffa9aff2b4e9c7a4a;

    assert(public_inputs.sha_root[0] == expected_sha_root, "sha root does not match");
}