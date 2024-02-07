use dep::public_kernel_lib::{PublicKernelPrivatePreviousInputs};
use dep::types::{PublicKernelCircuitPublicInputs};

unconstrained fn main(input: PublicKernelPrivatePreviousInputs) -> distinct pub PublicKernelCircuitPublicInputs {
    input.public_kernel_private_previous()
}
