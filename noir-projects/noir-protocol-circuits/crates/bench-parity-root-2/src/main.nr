use rollup_lib::bench::{
    parity_public_inputs::BenchParityPublicInputs,
    parity_root::{execute, BenchParityRootPrivateInputs},
};

fn main(inputs: BenchParityRootPrivateInputs<2>) -> pub BenchParityPublicInputs {
    execute(inputs)
}
