use dep::parity_lib::{ParityPublicInputs, ParityRootPrivateInputs};

fn main(inputs: ParityRootPrivateInputs) -> pub ParityPublicInputs {
    inputs.execute()
}
