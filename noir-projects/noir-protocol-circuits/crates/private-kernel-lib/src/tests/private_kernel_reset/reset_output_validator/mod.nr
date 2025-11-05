mod propagated_note_hashes_tests;
mod propagated_nullifiers_tests;

use crate::{
    abis::PrivateKernelResetHints,
    components::{
        reset_output_composer::reset_output_hints::{generate_reset_output_hints, ResetOutputHints},
        reset_output_validator::ResetOutputValidator,
    },
};
use super::{
    KEY_VALIDATION_HINTS_LEN, NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN,
    NOTE_HASH_SILOING_AMOUNT, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN,
    NULLIFIER_SILOING_AMOUNT, PRIVATE_LOG_SILOING_AMOUNT, TestBuilder,
    TRANSIENT_DATA_SQUASHING_HINTS_LEN,
};

impl TestBuilder {
    pub fn get_output_hints(self) -> ResetOutputHints {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        // Safety: This is only used in tests.
        unsafe {
            generate_reset_output_hints(previous_kernel, self.transient_data_squashing_hints)
        }
    }

    pub fn get_reset_hints(
        self,
    ) -> PrivateKernelResetHints<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN> {
        PrivateKernelResetHints {
            note_hash_read_request_hints: self.note_hash_read_request_hints.to_hints(),
            nullifier_read_request_hints: self.nullifier_read_request_hints.to_hints(),
            key_validation_hints: self.key_validation_hints.storage(),
            transient_data_squashing_hints: self.transient_data_squashing_hints,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
        }
    }

    pub fn validate(self) {
        let output_hints = self.get_output_hints();
        self
            .validate_with_amounts::<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN, 0, 0, 0>(
                output_hints,
            );
    }

    pub fn validate_siloing(self) {
        let output_hints = self.get_output_hints();
        self.validate_siloing_with_output_hints(output_hints);
    }

    pub fn validate_siloing_with_output_hints(self, output_hints: ResetOutputHints) {
        self
            .validate_with_amounts::<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN, NOTE_HASH_SILOING_AMOUNT, NULLIFIER_SILOING_AMOUNT, PRIVATE_LOG_SILOING_AMOUNT>(
                output_hints,
            );
    }

    pub fn validate_with_amounts<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
        output_hints: ResetOutputHints,
    ) {
        let output = self.output.to_private_kernel_circuit_public_inputs();
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        let reset_hints = self.get_reset_hints();

        ResetOutputValidator::new(
            output,
            previous_kernel,
            self.padded_side_effects,
            reset_hints,
            output_hints,
        )
            .validate::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount, TransientDataSquashingAmount, NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
    }
}
