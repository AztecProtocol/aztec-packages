use rollup_lib::parity::{inbox_parity, InboxParityPrivateInputs, ParityPublicInputs};

fn main(inputs: InboxParityPrivateInputs<1024>) -> pub ParityPublicInputs {
    inbox_parity::execute(inputs)
}
