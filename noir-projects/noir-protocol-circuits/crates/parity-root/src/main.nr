use dep::parity_lib::{ParityPublicInputs, RootParityInputs};

fn main(inputs: RootParityInputs) -> pub ParityPublicInputs {
    inputs.root_parity_circuit()
}
