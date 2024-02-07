use dep::private_kernel_lib::PrivateKernelInputsInit;
use dep::types::PrivateKernelInnerCircuitPublicInputs;

fn main(input: PrivateKernelInputsInit) -> distinct pub PrivateKernelInnerCircuitPublicInputs {
    input.native_private_kernel_circuit_initial()
}
