use dep::private_kernel_lib::PrivateKernelTailToPublicCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;

unconstrained fn main(input: PrivateKernelTailToPublicCircuitPrivateInputs) ->  PublicKernelCircuitPublicInputs {
    input.execute()
}
