use crate::abis::ParityPublicInputs;
use dep::types::{
    constants::{NUM_BASE_PARITY_PER_ROOT_PARITY, PARITY_BASE_VK_INDEX},
    merkle_tree::MerkleTree,
    proof::proof_data::UltraHonkProofData,
};

pub type ParityBaseProofData = UltraHonkProofData<ParityPublicInputs>;

pub struct ParityRootPrivateInputs {
    pub(crate) children: [ParityBaseProofData; NUM_BASE_PARITY_PER_ROOT_PARITY],
}

/// The Parity Root circuit aggregates multiple Parity Base proofs to form the complete L1-to-L2 message subtree for a
/// checkpoint. It combines the merkle roots from child circuits into final roots.
///
/// This circuit:
/// - Verifies proofs from multiple Parity Base circuits (the children)
/// - Validates that all children use the same vk_tree_root
/// - Validates that all children use the same verification key (consistent vk hash, index, and path)
/// - Validates the verification key exists in the vk tree
/// - Computes the final SHA256 merkle root by merging the children's SHA roots
/// - Computes the final Poseidon merkle root by merging the children's converted roots
///
/// The output feeds into the Block Root First circuits, where the `sha_root` is used to compute the `in_hash` for
/// verification against the value on L1, and the `converted_root` is inserted into the L1-to-L2 message tree to be
/// consumed by the app circuits.
///
/// VkIndex: PARITY_ROOT_VK_INDEX
pub fn execute(inputs: ParityRootPrivateInputs) -> ParityPublicInputs {
    let vk_tree_root = inputs.children[0].public_inputs.vk_tree_root;
    for i in 1..NUM_BASE_PARITY_PER_ROOT_PARITY {
        assert_eq(
            inputs.children[i].public_inputs.vk_tree_root,
            vk_tree_root,
            "Inconsistent vk tree roots across parity base circuits",
        );
    }

    verify_child_proofs(inputs);

    let mut sha_roots = [0; NUM_BASE_PARITY_PER_ROOT_PARITY];
    let mut converted_roots = [0; NUM_BASE_PARITY_PER_ROOT_PARITY];
    for i in 0..NUM_BASE_PARITY_PER_ROOT_PARITY {
        sha_roots[i] = inputs.children[i].public_inputs.sha_root;
        converted_roots[i] = inputs.children[i].public_inputs.converted_root;
    }

    let sha_tree = MerkleTree::new_sha(sha_roots);
    let poseidon_tree = MerkleTree::new(converted_roots);

    ParityPublicInputs {
        sha_root: sha_tree.get_root(),
        converted_root: poseidon_tree.get_root(),
        vk_tree_root,
    }
}

fn verify_child_proofs(inputs: ParityRootPrivateInputs) {
    let vk_data = inputs.children[0].vk_data;
    let vk_tree_root = inputs.children[0].public_inputs.vk_tree_root;

    inputs.children[0].verify_proof();

    for i in 1..NUM_BASE_PARITY_PER_ROOT_PARITY {
        inputs.children[i].verify_proof();

        // No need to check `vk_data.vk.key` here, as it's verified in bb that it produces the given hash (`vk_data.vk.hash`).
        // So we can ensure that all the keys are the same by asserting that their hashes are equal across all children.
        assert_eq(
            inputs.children[i].vk_data.vk.hash,
            vk_data.vk.hash,
            "Inconsistent vk hashes across parity base circuits",
        );
        assert_eq(
            inputs.children[i].vk_data.leaf_index,
            vk_data.leaf_index,
            "Inconsistent vk indices across parity base circuits",
        );
        assert_eq(
            inputs.children[i].vk_data.sibling_path,
            vk_data.sibling_path,
            "Inconsistent vk paths across parity base circuits",
        );
    }

    assert_eq(vk_data.leaf_index, PARITY_BASE_VK_INDEX, "Incorrect vk index for parity base");

    // Since the vk hashes and paths have been checked to be consistent across all children,
    // it's sufficient to validate that one of them exists in the vk tree.
    vk_data.validate_in_vk_tree(vk_tree_root);
}
