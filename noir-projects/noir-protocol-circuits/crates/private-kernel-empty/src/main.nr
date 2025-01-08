use dep::private_kernel_lib::PrivateKernelEmptyPrivateInputs;
use dep::types::PrivateToRollupKernelCircuitPublicInputs;

fn main(input: PrivateKernelEmptyPrivateInputs) -> pub PrivateToRollupKernelCircuitPublicInputs {
    input.execute()
}
