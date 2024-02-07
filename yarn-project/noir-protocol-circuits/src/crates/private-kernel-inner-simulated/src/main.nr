use dep::private_kernel_lib::PrivateKernelInputsInner;
use dep::types::PrivateKernelInnerCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelInputsInner) -> distinct pub PrivateKernelInnerCircuitPublicInputs {
    input.native_private_kernel_circuit_inner()
}
