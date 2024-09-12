use dep::public_kernel_lib::PublicKernelMergeCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;

#[recursive]
fn main(input: PublicKernelMergeCircuitPrivateInputs) -> pub PublicKernelCircuitPublicInputs {
    input.execute()
}
