use dep::public_kernel_lib::{PublicKernelPublicPreviousInputs, KernelCircuitPublicInputs};

fn main(input: PublicKernelPublicPreviousInputs) -> distinct pub KernelCircuitPublicInputs {
    input.public_kernel_circuit_init()
}
