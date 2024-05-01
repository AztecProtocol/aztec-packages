use dep::public_kernel_lib::PublicKernelSetupCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;

fn main(input: PublicKernelSetupCircuitPrivateInputs) ->  PublicKernelCircuitPublicInputs {
    input.public_kernel_setup()
}
