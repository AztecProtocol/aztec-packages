use dep::private_kernel_lib::PrivateKernelInputsInner;
use dep::types::PrivateKernelInnerCircuitPublicInputs;

fn main(input: PrivateKernelInputsInner) -> distinct pub PrivateKernelInnerCircuitPublicInputs {
    input.native_private_kernel_circuit_inner()
}
