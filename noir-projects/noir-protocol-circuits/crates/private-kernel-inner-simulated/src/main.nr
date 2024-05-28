use dep::private_kernel_lib::PrivateKernelInnerCircuitPrivateInputs;
use dep::types::PrivateKernelCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelInnerCircuitPrivateInputs) -> pub Unconstrained<PrivateKernelCircuitPublicInputs> {
    input.native_private_kernel_circuit_inner()
}
