pub mod reset_output_hints;

pub use reset_output_hints::ResetOutputHints;

use crate::{
    abis::PaddedSideEffects,
    components::reset_output_composer::reset_output_hints::generate_reset_output_hints,
};
use dep::reset_kernel_lib::{PrivateValidationRequestProcessor, TransientDataIndexHint};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    address::AztecAddress,
    constants::{
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, MAX_U32_VALUE,
        SIDE_EFFECT_MASKING_ADDRESS,
    },
    hash::{compute_unique_siloed_note_hash, silo_note_hash, silo_nullifier, silo_private_log},
    utils::arrays::{array_length, sort_by_counter_asc, validate_padded_items},
};

pub struct ResetOutputComposer<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32> {
    pub previous_kernel: PrivateKernelCircuitPublicInputs,
    pub validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN>,
    pub padded_side_effects: PaddedSideEffects,
    pub note_hash_siloing_amount: u32,
    pub nullifier_siloing_amount: u32,
    pub private_log_siloing_amount: u32,
    pub hints: ResetOutputHints,
}

impl<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32> ResetOutputComposer<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN> {
    pub unconstrained fn new<let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32>(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN>,
        padded_side_effects: PaddedSideEffects,
        transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
        note_hash_siloing_amount: u32,
        nullifier_siloing_amount: u32,
        private_log_siloing_amount: u32,
    ) -> Self {
        let hints = generate_reset_output_hints(previous_kernel, transient_data_index_hints);
        ResetOutputComposer {
            previous_kernel,
            validation_request_processor,
            padded_side_effects,
            note_hash_siloing_amount,
            nullifier_siloing_amount,
            private_log_siloing_amount,
            hints,
        }
    }

    pub unconstrained fn finish(self) -> PrivateKernelCircuitPublicInputs {
        let mut output = self.previous_kernel;

        output.validation_requests = self.validation_request_processor.compose();

        output.end.note_hashes = if self.note_hash_siloing_amount == 0 {
            self.hints.kept_note_hashes
        } else {
            self.get_sorted_siloed_padded_note_hashes()
        };

        output.end.nullifiers = if self.nullifier_siloing_amount == 0 {
            self.hints.kept_nullifiers
        } else {
            self.get_sorted_siloed_padded_nullifiers()
        };

        output.end.private_logs = if self.private_log_siloing_amount == 0 {
            self.hints.kept_private_logs
        } else {
            self.get_sorted_siloed_padded_private_logs()
        };

        output
    }

    unconstrained fn get_sorted_siloed_padded_note_hashes(
        self,
    ) -> [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX] {
        let is_private_only = self.previous_kernel.is_private_only;
        let min_revertible_side_effect_counter =
            self.previous_kernel.min_revertible_side_effect_counter;
        let mut note_hashes = sort_by_counter_asc(self.hints.kept_note_hashes);
        let num_note_hashes = array_length(note_hashes);
        let padded_note_hashes = self.padded_side_effects.note_hashes;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_note_hashes, self.note_hash_siloing_amount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        validate_padded_items(
            padded_note_hashes,
            num_note_hashes,
            self.note_hash_siloing_amount,
        );

        for i in 0..note_hashes.len() {
            if (i >= num_note_hashes) & (padded_note_hashes[i] != 0) {
                note_hashes[i].note_hash.value = padded_note_hashes[i];
                note_hashes[i].note_hash.counter = MAX_U32_VALUE;
                note_hashes[i].contract_address = SIDE_EFFECT_MASKING_ADDRESS;
            }

            let note_hash = note_hashes[i];
            let siloed_note_hash = silo_note_hash(note_hash);
            let unique_note_hash = compute_unique_siloed_note_hash(
                siloed_note_hash,
                self.previous_kernel.claimed_first_nullifier,
                i,
            );
            // We don't silo with nonce revertible note hashes, since we don't know their final position in the tx
            note_hashes[i].note_hash.value = if is_private_only
                | (note_hash.counter() < min_revertible_side_effect_counter) {
                unique_note_hash
            } else {
                siloed_note_hash
            };
            note_hashes[i].contract_address = AztecAddress::zero();
        }
        note_hashes
    }

    unconstrained fn get_sorted_siloed_padded_nullifiers(
        self,
    ) -> [ScopedNullifier; MAX_NULLIFIERS_PER_TX] {
        let mut nullifiers = sort_by_counter_asc(self.hints.kept_nullifiers);
        let num_nullifiers = array_length(nullifiers);
        let padded_nullifiers = self.padded_side_effects.nullifiers;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_nullifiers, self.nullifier_siloing_amount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        validate_padded_items(
            padded_nullifiers,
            num_nullifiers,
            self.nullifier_siloing_amount,
        );

        for i in 0..nullifiers.len() {
            if (i >= num_nullifiers) & (padded_nullifiers[i] != 0) {
                nullifiers[i].nullifier.value = padded_nullifiers[i];
                nullifiers[i].nullifier.counter = MAX_U32_VALUE;
                nullifiers[i].contract_address = SIDE_EFFECT_MASKING_ADDRESS;
            }

            nullifiers[i].nullifier.value = silo_nullifier(nullifiers[i]);
            nullifiers[i].contract_address = AztecAddress::zero();
        }
        nullifiers
    }

    unconstrained fn get_sorted_siloed_padded_private_logs(
        self,
    ) -> [Scoped<PrivateLogData>; MAX_PRIVATE_LOGS_PER_TX] {
        let mut private_logs = sort_by_counter_asc(self.hints.kept_private_logs);
        let num_private_logs = array_length(private_logs);
        let padded_private_logs = self.padded_side_effects.private_logs;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_private_logs, self.private_log_siloing_amount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        validate_padded_items(
            padded_private_logs,
            num_private_logs,
            self.private_log_siloing_amount,
        );

        for i in 0..private_logs.len() {
            if (i >= num_private_logs) & (padded_private_logs[i].length != 0) {
                private_logs[i].inner.log = padded_private_logs[i];
                private_logs[i].inner.counter = MAX_U32_VALUE;
                private_logs[i].contract_address = SIDE_EFFECT_MASKING_ADDRESS;
            }

            private_logs[i].inner.log = silo_private_log(private_logs[i]);
            private_logs[i].contract_address = AztecAddress::zero();
        }

        private_logs
    }
}
