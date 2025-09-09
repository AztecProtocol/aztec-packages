use dep::rollup_lib::base::PublicTubePrivateInputs;
use types::abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs;

fn main(inputs: PublicTubePrivateInputs) -> pub PrivateToPublicKernelCircuitPublicInputs {
    inputs.execute()
}
