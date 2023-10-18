use dep::private_kernel_init_lib::PrivateKernelInputsInit;
use dep::private_kernel_lib::KernelCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelInputsInit) -> distinct pub KernelCircuitPublicInputs {
    input.native_private_kernel_circuit_initial()
}
