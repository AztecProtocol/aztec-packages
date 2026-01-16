use crate::abis::ParityPublicInputs;
use dep::types::{constants::NUM_MSGS_PER_BASE_PARITY, merkle_tree::MerkleTree};

pub struct ParityBasePrivateInputs {
    pub(crate) msgs: [Field; NUM_MSGS_PER_BASE_PARITY],
    pub(crate) vk_tree_root: Field,
}

/// The Parity Base circuit processes a batch of L1-to-L2 messages and computes their merkle roots.
/// It is the first step in converting L1 messages from SHA256 format (used on L1) to Poseidon format
/// (used in Aztec's state trees).
///
/// This circuit:
/// - Takes a fixed batch of L1-to-L2 messages as input
/// - Computes a SHA256 merkle tree root over the messages (for verification on L1)
/// - Computes a Poseidon merkle tree root over the same messages (for L2 state tree insertion)
/// - Outputs both roots along with the vk_tree_root for consistency verification
///
/// The output feeds into the Parity Root circuit, which aggregates multiple Parity Base proofs to form the complete
/// L1-to-L2 message subtree for a checkpoint.
///
/// VkIndex: PARITY_BASE_VK_INDEX
pub fn execute(inputs: ParityBasePrivateInputs) -> ParityPublicInputs {
    let sha_tree = MerkleTree::new_sha(inputs.msgs);
    let poseidon_tree = MerkleTree::new(inputs.msgs);

    ParityPublicInputs {
        sha_root: sha_tree.get_root(),
        converted_root: poseidon_tree.get_root(),
        vk_tree_root: inputs.vk_tree_root,
    }
}
