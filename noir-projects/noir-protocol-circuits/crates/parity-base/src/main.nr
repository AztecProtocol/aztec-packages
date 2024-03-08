use dep::parity_lib::base::{BaseParityInputs, BaseParityPublicInputs};

fn main(inputs: BaseParityInputs) -> pub BaseParityPublicInputs {
    inputs.base_parity_circuit()
}
