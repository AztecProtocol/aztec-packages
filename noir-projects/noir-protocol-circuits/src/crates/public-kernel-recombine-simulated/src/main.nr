use dep::public_kernel_lib::PublicKernelRecombineCircuitPrivateInputs;
use dep::types::RollupKernelCircuitPublicInputs;

unconstrained fn main(input: PublicKernelRecombineCircuitPrivateInputs) -> distinct pub RollupKernelCircuitPublicInputs {
    input.public_kernel_recombine()
}
