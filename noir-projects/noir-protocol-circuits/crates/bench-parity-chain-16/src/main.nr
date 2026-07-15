use rollup_lib::bench::{
    parity_chain::{execute, BenchParityChainPrivateInputs},
    parity_public_inputs::BenchParityPublicInputs,
};

fn main(inputs: BenchParityChainPrivateInputs<16>) -> pub BenchParityPublicInputs {
    execute(inputs)
}
