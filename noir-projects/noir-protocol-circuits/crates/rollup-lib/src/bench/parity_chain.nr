use crate::{
    abis::L1ToL2MessageSponge, bench::parity_public_inputs::BenchParityPublicInputs,
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
};
use types::utils::arrays::assert_trailing_zeros;

/// Private inputs for the bench parity chain circuit, generic over the message bundle size `S`.
pub struct BenchParityChainPrivateInputs<let S: u32> {
    pub msgs: [Field; S],
    pub start_rolling_hash: Field,
    pub start_sponge: L1ToL2MessageSponge,
    pub num_msgs: u32,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

/// Bench variant of the parity base circuit with BOTH merkle trees (sha frontier + poseidon) removed. It measures the
/// cost of the end-state rolling-hash predicate alone: chain the real messages into the rolling hash and absorb the same
/// real messages into the message sponge. Serves option 1's base (S=256), option 2's head, and option 3's ladder.
pub fn execute<let S: u32>(inputs: BenchParityChainPrivateInputs<S>) -> BenchParityPublicInputs {
    // Guard the padding lanes so they can't silently enter either accumulator.
    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);

    let end_rolling_hash =
        accumulate_inbox_rolling_hash(inputs.start_rolling_hash, inputs.msgs, inputs.num_msgs);

    let mut end_sponge = inputs.start_sponge;
    end_sponge.absorb(inputs.msgs, inputs.num_msgs);

    BenchParityPublicInputs {
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
        start_sponge: inputs.start_sponge,
        end_sponge,
        num_msgs: inputs.num_msgs,
        vk_tree_root: inputs.vk_tree_root,
        prover_id: inputs.prover_id,
    }
}
