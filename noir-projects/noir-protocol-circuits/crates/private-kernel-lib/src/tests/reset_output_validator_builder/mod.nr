mod validate_sorted_siloed_note_hashes;
mod validate_sorted_siloed_nullifiers;

use crate::components::{
    reset_output_composer::{PrivateKernelResetOutputs, reset_output_hints::{generate_reset_output_hints, ResetOutputHints}},
    reset_output_validator::ResetOutputValidator
};
use dep::reset_kernel_lib::TransientDataIndexHint;
use dep::types::{constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX}, tests::fixture_builder::FixtureBuilder};

global NUM_INDEX_HINTS = 5;

struct ResetOutputValidatorBuilder {
    output: FixtureBuilder,
    previous_kernel: FixtureBuilder,
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    split_counter: u32,
    note_hash_siloing_amount: u32,
    nullifier_siloing_amount: u32,
    encrypted_log_siloing_amount: u32,
}

impl ResetOutputValidatorBuilder {
    pub fn new() -> Self {
        let mut output = FixtureBuilder::new();
        let mut previous_kernel = FixtureBuilder::new();
        output.set_first_nullifier();
        previous_kernel.set_first_nullifier();

        let transient_data_index_hints = [TransientDataIndexHint::nada(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX); NUM_INDEX_HINTS];

        ResetOutputValidatorBuilder {
            output,
            previous_kernel,
            transient_data_index_hints,
            split_counter: 0,
            note_hash_siloing_amount: 0,
            nullifier_siloing_amount: 0,
            encrypted_log_siloing_amount: 0
        }
    }

    pub fn get_hints(self) -> ResetOutputHints {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        generate_reset_output_hints(previous_kernel, self.transient_data_index_hints)
    }

    pub fn get_output(self) -> PrivateKernelResetOutputs {
        let data = self.output.to_private_accumulated_data();
        PrivateKernelResetOutputs {
            note_hashes: data.note_hashes,
            nullifiers: data.nullifiers,
            note_encrypted_log_hashes: data.note_encrypted_logs_hashes,
            encrypted_log_hashes: data.encrypted_logs_hashes
        }
    }

    pub fn validate_with_hints(self, hints: ResetOutputHints) {
        let output = self.get_output();
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        ResetOutputValidator::new(
            output,
            previous_kernel,
            self.transient_data_index_hints,
            self.split_counter,
            self.note_hash_siloing_amount,
            self.nullifier_siloing_amount,
            self.encrypted_log_siloing_amount,
            hints
        ).validate();
    }

    pub fn validate(self) {
        let hints = self.get_hints();
        self.validate_with_hints(hints);
    }
}
