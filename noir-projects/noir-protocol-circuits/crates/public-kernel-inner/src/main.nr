use dep::public_kernel_lib::PublicKernelInnerCircuitPrivateInputs;
use dep::types::VMCircuitPublicInputs;

#[recursive]
fn main(input: PublicKernelInnerCircuitPrivateInputs) -> pub VMCircuitPublicInputs {
    input.execute()
}
