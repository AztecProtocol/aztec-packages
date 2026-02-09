use ::rollup_lib::parity::{parity_root, ParityPublicInputs, ParityRootPrivateInputs};

fn main(inputs: ParityRootPrivateInputs) -> pub ParityPublicInputs {
    parity_root::execute(inputs)
}
