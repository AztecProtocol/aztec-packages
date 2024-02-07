use dep::public_kernel_lib::{PublicKernelPublicPreviousInputs};
use dep::types::{PublicKernelCircuitPublicInputs};

unconstrained fn main(input: PublicKernelPublicPreviousInputs) -> distinct pub PublicKernelCircuitPublicInputs {
    input.public_kernel_public_previous()
}
