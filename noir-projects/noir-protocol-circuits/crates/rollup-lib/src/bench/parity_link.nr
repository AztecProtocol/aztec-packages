use crate::{
    bench::parity_public_inputs::BenchParityPublicInputs,
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
};
use types::{proof::proof_data::UltraHonkProofData, utils::arrays::assert_trailing_zeros};

// Bench-only allowed VK indices for the chained-parity option (option 2): a link verifies either the head segment or a
// previous link. As in parity_root, the concrete values are irrelevant to the gate count.
global BENCH_PARITY_HEAD_VK_INDEX: u32 = 21;
global BENCH_PARITY_LINK_VK_INDEX: u32 = 24;
global BENCH_ALLOWED_PREV_VK_INDICES: [u32; 2] =
    [BENCH_PARITY_HEAD_VK_INDEX, BENCH_PARITY_LINK_VK_INDEX];

global NUM_MSGS_PER_LINK: u32 = 256;

/// Private inputs for the bench parity link circuit (chained-parity option). It recursively verifies its predecessor
/// (a head or another link) and chains its own 256-message bundle on top.
pub struct BenchParityLinkPrivateInputs {
    pub prev: UltraHonkProofData<BenchParityPublicInputs>,
    pub msgs: [Field; NUM_MSGS_PER_LINK],
    pub num_msgs: u32,
}

/// Bench variant for option 2: the chain-256 body PLUS one recursive verification of a same-shaped predecessor proof.
/// It extends the predecessor's rolling hash and sponge by its own bundle and outputs the merged span.
pub fn execute(inputs: BenchParityLinkPrivateInputs) -> BenchParityPublicInputs {
    let prev = inputs.prev;
    prev.verify_proof();

    let vk_tree_root = prev.public_inputs.vk_tree_root;
    prev.vk_data.validate_allowed_in_vk_tree(vk_tree_root, BENCH_ALLOWED_PREV_VK_INDICES);

    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);

    let end_rolling_hash = accumulate_inbox_rolling_hash(
        prev.public_inputs.end_rolling_hash,
        inputs.msgs,
        inputs.num_msgs,
    );

    let mut end_sponge = prev.public_inputs.end_sponge;
    end_sponge.absorb(inputs.msgs, inputs.num_msgs);

    BenchParityPublicInputs {
        start_rolling_hash: prev.public_inputs.start_rolling_hash,
        end_rolling_hash,
        start_sponge: prev.public_inputs.start_sponge,
        end_sponge,
        num_msgs: prev.public_inputs.num_msgs + inputs.num_msgs,
        vk_tree_root,
        prover_id: prev.public_inputs.prover_id,
    }
}
