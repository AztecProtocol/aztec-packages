// Terminal public-bound kernel: runs final reset and tail-to-public finalisation in one circuit.

use crate::{
    abis::{PaddedSideEffectAmounts, PaddedSideEffects, PrivateKernelResetHints},
    components::{
        previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
        tail_to_public_finalize::tail_to_public_finalize,
    },
    private_kernel_reset::PrivateKernelResetCircuitPrivateInputs,
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
    },
    PrivateKernelCircuitPublicInputs,
};

pub struct PrivateKernelResetTailToPublicCircuitPrivateInputs<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    reset_inputs: PrivateKernelResetCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    expiration_timestamp_upper_bound: u64,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> PrivateKernelResetTailToPublicCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
        padded_side_effect_amounts: PaddedSideEffectAmounts,
        expiration_timestamp_upper_bound: u64,
    ) -> Self {
        Self {
            reset_inputs: PrivateKernelResetCircuitPrivateInputs::new(
                previous_kernel,
                previous_kernel_public_inputs,
                padded_side_effects,
                hints,
            ),
            padded_side_effect_amounts,
            expiration_timestamp_upper_bound,
        }
    }

    pub fn execute<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) -> PrivateToPublicKernelCircuitPublicInputs {
        let reset_output = self
            .reset_inputs
            .execute_as_terminal::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();

        // Reset validation does not cover terminal public-bound invariants; the tail validator does.
        validate_previous_kernel_for_tail(reset_output, true /* is_for_public */);

        tail_to_public_finalize(
            reset_output,
            self.padded_side_effect_amounts,
            self.expiration_timestamp_upper_bound,
        )
    }
}
