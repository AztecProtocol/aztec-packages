use crate::components::{vm_circuit_output_composer::VMCircuitOutputComposer};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::VMCircuitPublicInputs,
    public_kernel_inner_data::PublicKernelInnerData, public_call_data::PublicCallData
}
};

// TODO(#7124): To be deprecated.
struct PublicKernelInnerCircuitPrivateInputs {
    previous_kernel: PublicKernelInnerData,
    public_call: PublicCallData,
}

impl PublicKernelInnerCircuitPrivateInputs {
    fn execute(self) -> VMCircuitPublicInputs {
        VMCircuitOutputComposer::new_from_previous_kernel(self.previous_kernel.public_inputs).propagate_from_public_call(self.public_call.call_stack_item.public_inputs).finish()
    }
}
