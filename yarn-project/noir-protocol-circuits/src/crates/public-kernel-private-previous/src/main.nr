use dep::public_kernel_lib::{PublicKernelInputs, KernelCircuitPublicInputs};

fn main(input: PublicKernelInputs) -> distinct pub KernelCircuitPublicInputs {
    input.public_kernel_circuit_init()
}
