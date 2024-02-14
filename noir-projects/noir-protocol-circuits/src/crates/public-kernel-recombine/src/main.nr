use dep::public_kernel_lib::PublicKernelRecombineCircuitPrivateInputs;
use dep::types::RollupKernelCircuitPublicInputs;

fn main(input: PublicKernelRecombineCircuitPrivateInputs) -> distinct pub RollupKernelCircuitPublicInputs {
    input.public_kernel_recombine()
}
