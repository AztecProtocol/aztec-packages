use crate::{abis::ParityPublicInputs, inbox_rolling_hash::accumulate_inbox_rolling_hash};
use types::{
    constants::NUM_MSGS_PER_BASE_PARITY, merkle_tree::MerkleTree,
    utils::arrays::assert_trailing_zeros,
};

pub struct ParityBasePrivateInputs {
    pub(crate) msgs: [Field; NUM_MSGS_PER_BASE_PARITY],
    // Rolling hash of the Inbox message chain before absorbing this batch. The orchestrator threads it so that each
    // base's start equals the previous base's end, keeping the chain continuous across the four base proofs.
    pub(crate) start_rolling_hash: Field,
    // Number of real (non-padding) messages in `msgs`. Only these are absorbed into the rolling hash; the merkle roots
    // still absorb the full padded batch as before.
    pub(crate) num_msgs: u32,
    pub(crate) vk_tree_root: Field,
    pub(crate) prover_id: Field,
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
    // The merkle roots absorb the full padded batch (frontier-tree semantics unchanged), while the rolling hash chains
    // only the real messages. Assert the padding lanes are zero so they can't silently contribute to either commitment.
    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);

    let sha_tree = MerkleTree::new_sha(inputs.msgs);
    let poseidon_tree = MerkleTree::new(inputs.msgs);

    let end_rolling_hash =
        accumulate_inbox_rolling_hash(inputs.start_rolling_hash, inputs.msgs, inputs.num_msgs);

    ParityPublicInputs {
        sha_root: sha_tree.get_root(),
        converted_root: poseidon_tree.get_root(),
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
        num_msgs: inputs.num_msgs,
        vk_tree_root: inputs.vk_tree_root,
        prover_id: inputs.prover_id,
    }
}
