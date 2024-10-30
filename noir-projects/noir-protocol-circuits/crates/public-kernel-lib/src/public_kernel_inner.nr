use crate::components::vm_circuit_output_composer::VMCircuitOutputComposer;
use dep::types::abis::{
    kernel_circuit_public_inputs::VMCircuitPublicInputs, public_call_data::PublicCallData,
    public_kernel_inner_data::PublicKernelInnerData,
};

// TODO(#7124): To be deprecated.
pub struct PublicKernelInnerCircuitPrivateInputs {
    previous_kernel: PublicKernelInnerData,
    public_call: PublicCallData,
}

impl PublicKernelInnerCircuitPrivateInputs {
    fn execute(self) -> VMCircuitPublicInputs {
        VMCircuitOutputComposer::new_from_previous_kernel(self.previous_kernel.public_inputs)
            .propagate_from_public_call(self.public_call.public_inputs)
            .finish()
    }
}
