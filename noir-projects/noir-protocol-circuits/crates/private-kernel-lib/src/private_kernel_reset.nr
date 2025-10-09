use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    components::{
        previous_kernel_validator::PreviousKernelValidator,
        reset_output_composer::{ResetOutputComposer, ResetOutputHints},
        reset_output_validator::ResetOutputValidator,
    },
};
use dep::types::{
    abis::private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    constants::{PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX},
    PrivateKernelCircuitPublicInputs,
};

pub global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX];

pub struct PrivateKernelResetCircuitPrivateInputs<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    previous_kernel: PrivateKernelData,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> PrivateKernelResetCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            padded_side_effects,
            hints,
        }
    }

    unconstrained fn generate_output<let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32, let KeyValidationAmount: u32>(
        self,
    ) -> (PrivateKernelCircuitPublicInputs, ResetOutputHints) {
        // Many hints are generated within this `new` call.
        let composer = ResetOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.padded_side_effects,
            self.hints.transient_data_squashing_hints,
            self.hints.note_hash_read_request_hints.read_request_actions,
            self.hints.nullifier_read_request_hints.read_request_actions,
            self.hints.min_revertible_side_effect_counter,
        );
        (
            composer
                .finish::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount, KeyValidationAmount>(),
            composer.hints,
        )
    }

    pub fn execute<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) -> PrivateKernelCircuitPublicInputs {
        let previous_public_inputs = self.previous_kernel.public_inputs;
        // Validate inputs.
        let previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);
        previous_kernel_validator.verify_proof(ALLOWED_PREVIOUS_CIRCUITS, false);

        // Generate output.
        // Safety: The output is validated below by ResetOutputValidator.
        let (output, output_hints) = unsafe {
            self
                .generate_output::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount, KeyValidationAmount>()
        };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            ResetOutputValidator::new(
                output,
                previous_public_inputs,
                self.padded_side_effects,
                self.hints,
                output_hints,
            )
                .validate::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
        }

        output
    }
}
