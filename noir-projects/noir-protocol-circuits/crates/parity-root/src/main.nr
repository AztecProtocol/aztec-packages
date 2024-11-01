use dep::parity_lib::{ParityPublicInputs, RootParityInputs};

#[recursive]
fn main(inputs: RootParityInputs) -> pub ParityPublicInputs {
    inputs.root_parity_circuit()
}
