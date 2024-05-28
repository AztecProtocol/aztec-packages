use dep::private_kernel_lib::PrivateKernelTailCircuitPrivateInputs;
use dep::types::KernelCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelTailCircuitPrivateInputs) -> pub Unconstrained<KernelCircuitPublicInputs> {
    input.execute()
}
