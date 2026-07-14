// Terminal private-only kernel: runs final reset and rollup-bound tail finalisation in one circuit.
// The reset output is an in-witness value; terminal invariants are checked before composing
// rollup-bound public inputs.

use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    components::{
        previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
        tail_finalize::tail_finalize,
    },
    private_kernel_reset::PrivateKernelResetCircuitPrivateInputs,
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
    },
    PrivateKernelCircuitPublicInputs,
};

pub struct PrivateKernelResetTailCircuitPrivateInputs<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    reset_inputs: PrivateKernelResetCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    expiration_timestamp_upper_bound: u64,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> PrivateKernelResetTailCircuitPrivateInputs<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
        expiration_timestamp_upper_bound: u64,
    ) -> Self {
        Self {
            reset_inputs: PrivateKernelResetCircuitPrivateInputs::new(
                previous_kernel,
                previous_kernel_public_inputs,
                padded_side_effects,
                hints,
            ),
            expiration_timestamp_upper_bound,
        }
    }

    pub fn execute<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) -> PrivateToRollupKernelCircuitPublicInputs {
        let reset_output = self
            .reset_inputs
            .execute_as_terminal::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();

        // Reset validation does not cover terminal invariants; the tail validator does.
        validate_previous_kernel_for_tail(reset_output, false);

        tail_finalize(reset_output, self.expiration_timestamp_upper_bound)
    }
}
