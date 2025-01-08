use dep::private_kernel_lib::PrivateKernelEmptyPrivateInputs;
use dep::types::PrivateToRollupKernelCircuitPublicInputs;

unconstrained fn main(
    input: PrivateKernelEmptyPrivateInputs,
) -> pub PrivateToRollupKernelCircuitPublicInputs {
    input.execute()
}
