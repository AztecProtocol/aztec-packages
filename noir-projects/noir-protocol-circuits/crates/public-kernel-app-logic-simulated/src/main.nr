use dep::public_kernel_lib::PublicKernelAppLogicCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;

unconstrained fn main(input: PublicKernelAppLogicCircuitPrivateInputs) -> pub Unconstrained<PublicKernelCircuitPublicInputs> {
    input.public_kernel_app_logic()
}
