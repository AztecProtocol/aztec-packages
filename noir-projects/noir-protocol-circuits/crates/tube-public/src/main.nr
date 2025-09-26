use dep::rollup_lib::tx_base::{PublicTubePrivateInputs, PublicTubePublicInputs};

fn main(inputs: PublicTubePrivateInputs) -> pub PublicTubePublicInputs {
    inputs.execute()
}
