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

mod tests {
    use crate::{
        parity_public_inputs::ParityPublicInputs,
        root::{
            root_parity_input::RootParityInput,
            root_parity_inputs::RootParityInputs,
        }
    };
    use dep::types::mocked::{AggregationObject, Proof};

    #[test]
    fn test_sha_root_matches_frontier_tree() {
        let children_sha_roots = [
            [0x00000000000000000000000000000000151de48ca3efbae39f180fe00b8f472e, 0x00000000000000000000000000000000c9f25be10b4f283a87c6d78393537039],
            [0x0000000000000000000000000000000014c2ea9dedf77698d4afe23bc663263e, 0x00000000000000000000000000000000ed0bf9aa3a8b17d9b74812f185610f9e],
            [0x000000000000000000000000000000001570cc6641699e3ae87fa258d80a6d85, 0x000000000000000000000000000000003f7b8ccb211dc244d017e2ca6530f8a1],
            [0x000000000000000000000000000000002806c860af67e9cd50000378411b8c4c, 0x000000000000000000000000000000004db172ceb2daa862b259b689ccbdc1e0],
        ];

        let children = [
            RootParityInput { proof: Proof {}, public_inputs: ParityPublicInputs { aggregation_object: AggregationObject {}, sha_root: children_sha_roots[0], converted_root: 0 } },
            RootParityInput { proof: Proof {}, public_inputs: ParityPublicInputs { aggregation_object: AggregationObject {}, sha_root: children_sha_roots[1], converted_root: 0 } },
            RootParityInput { proof: Proof {}, public_inputs: ParityPublicInputs { aggregation_object: AggregationObject {}, sha_root: children_sha_roots[2], converted_root: 0 } },
            RootParityInput { proof: Proof {}, public_inputs: ParityPublicInputs { aggregation_object: AggregationObject {}, sha_root: children_sha_roots[3], converted_root: 0 } },
        ];

        let root_parity_inputs = RootParityInputs { children };

        let public_inputs = root_parity_inputs.root_parity_circuit();

        // 0xb3a3fc1968999f2c2d798b900bdf0de41311be2a4d20496a7e792a521fc8abac converted to 2 fields
        let expected_sha_root = [
            0x00000000000000000000000000000000b3a3fc1968999f2c2d798b900bdf0de4,
            0x000000000000000000000000000000001311be2a4d20496a7e792a521fc8abac
        ];

        assert(public_inputs.sha_root == expected_sha_root, "sha root does not match");
    }
}