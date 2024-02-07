use dep::private_kernel_lib::PrivateKernelInputsOrdering;
use dep::types::PrivateKernelTailCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelInputsOrdering) -> distinct pub PrivateKernelTailCircuitPublicInputs {
    input.native_private_kernel_circuit_ordering()
}
