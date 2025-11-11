use crate::components::{
    previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
    tail_output_composer::TailOutputComposer, tail_output_validator::TailOutputValidator,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    },
    constants::{PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX},
    PrivateKernelCircuitPublicInputs,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX];

pub struct PrivateKernelTailCircuitPrivateInputs {
    previous_kernel: PrivateKernelData,
    // The `include_by_timestamp` set by the wallet. The wallet should take the value aggregated during the transaction
    // and decide whether to keep it or lower it.
    // For example, it may round the value down to the nearest hour to improve privacy.
    // If this value is higher than the `include_by_timestamp` requested during tx execution, it will be ignored.
    include_by_timestamp_upper_bound: u64,
}

impl PrivateKernelTailCircuitPrivateInputs {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            include_by_timestamp_upper_bound,
        }
    }

    unconstrained fn generate_output(self) -> PrivateToRollupKernelCircuitPublicInputs {
        TailOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.include_by_timestamp_upper_bound,
        )
            .finish()
    }

    pub fn execute(self) -> PrivateToRollupKernelCircuitPublicInputs {
        // Validate inputs.
        if !dep::std::runtime::is_unconstrained() {
            self.previous_kernel.verify(true /* is_last_kernel */);
            self.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        validate_previous_kernel_for_tail(
            self.previous_kernel.public_inputs,
            false, /* is_for_public */
        );

        // Generate output.
        // Safety: The output is validated below by TailOutputValidator.
        let output = unsafe { self.generate_output() };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            TailOutputValidator::new(
                output,
                self.previous_kernel.public_inputs,
                self.include_by_timestamp_upper_bound,
            )
                .validate();
        }

        output
    }
}
