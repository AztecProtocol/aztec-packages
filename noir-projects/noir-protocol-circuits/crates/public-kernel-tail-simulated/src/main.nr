use dep::public_kernel_lib::PublicKernelTailCircuitPrivateInputs;
use dep::types::KernelCircuitPublicInputs;

unconstrained fn main(input: PublicKernelTailCircuitPrivateInputs) ->  KernelCircuitPublicInputs {
    input.public_kernel_tail()
}
