use dep::rollup_lib::parity::{parity_base, ParityBasePrivateInputs, ParityPublicInputs};

fn main(inputs: ParityBasePrivateInputs) -> pub ParityPublicInputs {
    parity_base::execute(inputs)
}
