use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
        tail_to_public_output_composer::TailToPublicOutputComposer,
        tail_to_public_output_validator::TailToPublicOutputValidator,
    },
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
        private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    },
    constants::{PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX},
    PrivateKernelCircuitPublicInputs,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX];

pub struct PrivateKernelTailToPublicCircuitPrivateInputs {
    previous_kernel: PrivateKernelData,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    // The `include_by_timestamp` set by the wallet. The wallet should take the value aggregated during the transaction
    // and decide whether to keep it or lower it.
    // For example, it may round the value down to the nearest hour to improve privacy.
    // If this value is higher than the `include_by_timestamp` requested during tx execution, it will be ignored.
    include_by_timestamp_upper_bound: u64,
}

impl PrivateKernelTailToPublicCircuitPrivateInputs {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effect_amounts: PaddedSideEffectAmounts,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            padded_side_effect_amounts,
            include_by_timestamp_upper_bound,
        }
    }

    unconstrained fn generate_output(self) -> PrivateToPublicKernelCircuitPublicInputs {
        TailToPublicOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.padded_side_effect_amounts,
            self.include_by_timestamp_upper_bound,
        )
            .finish()
    }

    pub fn execute(self) -> PrivateToPublicKernelCircuitPublicInputs {
        // Validate inputs.

        if !dep::std::runtime::is_unconstrained() {
            self.previous_kernel.verify(true /* is_last_kernel */);
            self.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        validate_previous_kernel_for_tail(
            self.previous_kernel.public_inputs,
            true, /* is_for_public */
        );

        // Generate output.
        // Safety: The output is validated below by TailToPublicOutputValidator.
        let output = unsafe { self.generate_output() };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            TailToPublicOutputValidator::new(
                output,
                self.previous_kernel.public_inputs,
                self.padded_side_effect_amounts,
                self.include_by_timestamp_upper_bound,
            )
                .validate();
        }

        output
    }
}
