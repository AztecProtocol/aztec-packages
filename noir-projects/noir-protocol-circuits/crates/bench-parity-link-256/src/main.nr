use rollup_lib::bench::{
    parity_link::{execute, BenchParityLinkPrivateInputs},
    parity_public_inputs::BenchParityPublicInputs,
};

fn main(inputs: BenchParityLinkPrivateInputs) -> pub BenchParityPublicInputs {
    execute(inputs)
}
