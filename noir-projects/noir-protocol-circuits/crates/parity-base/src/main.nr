use dep::parity_lib::{ParityBasePrivateInputs, ParityPublicInputs};

fn main(inputs: ParityBasePrivateInputs) -> pub ParityPublicInputs {
    inputs.execute()
}
