use dep::public_kernel_lib::PublicKernelMergeCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;

unconstrained fn main(input: PublicKernelMergeCircuitPrivateInputs) -> pub PublicKernelCircuitPublicInputs {
    input.execute()
}
