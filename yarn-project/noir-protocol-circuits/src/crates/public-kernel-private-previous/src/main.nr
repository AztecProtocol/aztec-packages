use dep::public_kernel_lib::{PublicKernelPrivatePreviousInputs};
use dep::private_kernel_lib::{KernelCircuitPublicInputs};

fn main(input: PublicKernelPrivatePreviousInputs) -> distinct pub KernelCircuitPublicInputs {
    input.public_kernel_private_previous()  // function naming?
}
