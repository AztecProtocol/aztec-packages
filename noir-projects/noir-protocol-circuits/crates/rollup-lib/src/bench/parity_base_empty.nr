use crate::{abis::L1ToL2MessageSponge, bench::parity_public_inputs::BenchParityPublicInputs};

/// Private inputs for the trivial pass-through bench parity circuit. It carries no message array.
pub struct BenchParityBaseEmptyPrivateInputs {
    pub start_rolling_hash: Field,
    pub start_sponge: L1ToL2MessageSponge,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

/// Bench filler circuit for option 1b: a pure pass-through with `end == start` and `num_msgs = 0`. It exists to be fed
/// into a fixed-4 parity root's unused child slots, so its gate count should be near zero.
pub fn execute(inputs: BenchParityBaseEmptyPrivateInputs) -> BenchParityPublicInputs {
    BenchParityPublicInputs {
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash: inputs.start_rolling_hash,
        start_sponge: inputs.start_sponge,
        end_sponge: inputs.start_sponge,
        num_msgs: 0,
        vk_tree_root: inputs.vk_tree_root,
        prover_id: inputs.prover_id,
    }
}
