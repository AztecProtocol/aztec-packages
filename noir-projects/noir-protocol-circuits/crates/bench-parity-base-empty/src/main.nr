use rollup_lib::bench::{
    parity_base_empty::{execute, BenchParityBaseEmptyPrivateInputs},
    parity_public_inputs::BenchParityPublicInputs,
};

fn main(inputs: BenchParityBaseEmptyPrivateInputs) -> pub BenchParityPublicInputs {
    execute(inputs)
}
