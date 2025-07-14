struct HidingKernelInputs {}
use private_kernel_lib::components::previous_kernel_validator::PreviousKernelValidator;

use types::abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs;
use types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
use types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs;
use types::abis::private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs};
use types::PrivateKernelCircuitPublicInputs;

use types::constants::{
    PRIVATE_KERNEL_TAIL_INDEX, PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX, PROOF_TYPE_PG_FINAL,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 2] =
    [PRIVATE_KERNEL_TAIL_INDEX, PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX];

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    // TODO: add include_by_timestamp_upper_bound
) {
    let private_inputs = HidingKernelPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs, /*, include_by_timestamp_upper_bound*/
    );
    private_inputs.execute();
}

pub struct HidingKernelPrivateInputs {
    previous_kernel: PrivateKernelData,
}

impl HidingKernelPrivateInputs {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        }
    }

    pub fn execute(self) {
        // verify previous kernel
        // the kernel contains a protogalaxy proof and a decider proof
        // we have introduced a new proof type for the final proof, which is PROOF_TYPE_PG_FINAL which includes both these proofs
        if !std::runtime::is_unconstrained() {
            std::verify_proof_with_type(
                self.previous_kernel.vk_data.vk.key,
                [],
                [],
                self.previous_kernel.vk_data.vk.hash,
                PROOF_TYPE_PG_FINAL,
            );
            // check that the previous circuit was a tail kernel
            self.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }
    }
}
