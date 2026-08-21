use rollup_lib::parity::{inbox_parity, InboxParityPrivateInputs, ParityPublicInputs};

fn main(inputs: InboxParityPrivateInputs<256>) -> pub ParityPublicInputs {
    inbox_parity::execute(inputs)
}
