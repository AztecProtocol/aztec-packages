use rollup_lib::bench::{
    parity_chain::{execute, BenchParityChainPrivateInputs},
    parity_public_inputs::BenchParityPublicInputs,
};

fn main(inputs: BenchParityChainPrivateInputs<256>) -> pub BenchParityPublicInputs {
    execute(inputs)
}
