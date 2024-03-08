use dep::parity_lib::root::{RootParityInputs, RootParityPublicInputs};

fn main(inputs: RootParityInputs) -> pub RootParityInputsPublicInputs {
    inputs.root_parity_circuit()
}
