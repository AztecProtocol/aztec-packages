use crate::components::{reset_output_composer::{PrivateKernelResetOutputs, ResetOutputHints}};
use dep::reset_kernel_lib::verify_squashed_transient_data;
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    log_hash::{NoteLogHash, ScopedEncryptedLogHash}, nullifier::ScopedNullifier
},
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX},
    hash::{mask_encrypted_log_hash, silo_note_hash, silo_nullifier}, traits::is_empty,
    utils::arrays::assert_sorted_transformed_value_array
};

struct ResetOutputValidator {
    output: PrivateKernelResetOutputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    transient_nullifier_indexes_for_note_hashes: [u32; MAX_NOTE_HASHES_PER_TX],
    transient_note_hash_indexes_for_nullifiers: [u32; MAX_NULLIFIERS_PER_TX],
    split_counter: u32,
    note_hash_siloing_amount: u32,
    nullifier_siloing_amount: u32,
    encrypted_log_siloing_amount: u32,
    hints: ResetOutputHints,
}

impl ResetOutputValidator {
    pub fn new(
        output: PrivateKernelResetOutputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        transient_nullifier_indexes_for_note_hashes: [u32; MAX_NOTE_HASHES_PER_TX],
        transient_note_hash_indexes_for_nullifiers: [u32; MAX_NULLIFIERS_PER_TX],
        split_counter: u32,
        note_hash_siloing_amount: u32,
        nullifier_siloing_amount: u32,
        encrypted_log_siloing_amount: u32,
        hints: ResetOutputHints
    ) -> Self {
        ResetOutputValidator {
            output,
            previous_kernel,
            transient_nullifier_indexes_for_note_hashes,
            transient_note_hash_indexes_for_nullifiers,
            split_counter,
            note_hash_siloing_amount,
            nullifier_siloing_amount,
            encrypted_log_siloing_amount,
            hints
        }
    }

    pub fn validate(self) {
        self.validate_squashed_data();

        if self.note_hash_siloing_amount == 0 {
            assert_eq(self.output.note_hashes, self.hints.kept_note_hashes, "output note hashes mismatch");
            assert_eq(
                self.output.note_encrypted_log_hashes, self.hints.kept_note_encrypted_log_hashes, "output note logs mismatch"
            );
        } else {
            self.validate_sorted_siloed_note_hashes();
            self.validate_sorted_note_logs();
        }

        if self.nullifier_siloing_amount == 0 {
            assert_eq(self.output.nullifiers, self.hints.kept_nullifiers, "output nullifiers mismatch");
        } else {
            self.validate_sorted_siloed_nullifiers();
        }

        if self.encrypted_log_siloing_amount == 0 {
            assert_eq(
                self.output.encrypted_log_hashes, self.previous_kernel.end.encrypted_logs_hashes, "output encrypted logs mismatch"
            );
        } else {
            self.validate_sorted_masked_encrypted_logs();
        }
    }

    fn validate_squashed_data(self) {
        verify_squashed_transient_data(
            self.previous_kernel.end.note_hashes,
            self.previous_kernel.end.nullifiers,
            self.previous_kernel.end.note_encrypted_logs_hashes,
            self.hints.kept_note_hashes,
            self.hints.kept_nullifiers,
            self.hints.kept_note_encrypted_log_hashes,
            self.transient_nullifier_indexes_for_note_hashes,
            self.transient_note_hash_indexes_for_nullifiers,
            self.hints.transient_or_propagated_note_hash_indexes_for_logs,
            self.split_counter
        );
    }

    fn validate_sorted_siloed_note_hashes(self) {
        // Check that the values are not already siloed in a previous reset.
        // Note hashes need to be siloed alltogether because new note hashes added later might affect the ordering and result in wrong nonces.
        // We only need to check the first item, since we always start siloing from index 0.
        // The first item should either be empty or not siloed (contract_address != 0).
        let note_hash = self.previous_kernel.end.note_hashes[0];
        assert(
            is_empty(note_hash) | !note_hash.contract_address.is_zero(), "note hashes have been siloed in a previous reset"
        );

        // Don't have to check that note_hash_siloing_amount will cover all the non-empty note hashes.
        // If it is not big enough, we won't be able to create a valid tail(_to_public) proof.
        // It will fail in previous_kernel_validator > verify_sorted_siloed_values.

        // Check siloing.
        let kept_note_hashes = self.hints.kept_note_hashes;
        let siloed_note_hashes = self.hints.siloed_note_hashes;
        let sorted_hints = self.hints.sorted_note_hash_hints;
        let tx_hash = self.output.nullifiers[0].value(); // First nullifier is tx hash.
        for i in 0..kept_note_hashes.len() {
            let siloed_note_hash = siloed_note_hashes[i];
            let note_hash = kept_note_hashes[i];
            if i < self.note_hash_siloing_amount {
                let siloed_value = silo_note_hash(note_hash, tx_hash, sorted_hints[i].sorted_index);
                assert_eq(siloed_note_hash.value(), siloed_value, "incorrect siloed note hashes");
                assert_eq(
                    siloed_note_hash.counter(), note_hash.counter(), "mismatch counter for siloed note hash"
                );
                assert(
                    siloed_note_hash.contract_address.is_zero(), "contract address must not be exposed for siloed note hash"
                );
            } else {
                // Don't have to check empty items in siloed_note_hash.
                // assert_sorted_transformed_value_array ensures that there are the same amount of empty items in kept_note_hashes and in self.output.note_hashes.
                // assert(is_empty(siloed_note_hash), "unexpected siloed note hash");
            }
        }

        // Check ordering.
        assert_sorted_transformed_value_array(
            kept_note_hashes,
            siloed_note_hashes,
            self.output.note_hashes,
            sorted_hints
        );
    }

    fn validate_sorted_siloed_nullifiers(self) {
        // Unlike note hashes, we don't have to check that the nullifiers haven't been siloed.
        // silo_nullifier() will return the already-siloed value if contract address is zero.

        // Check siloing.
        let kept_nullifiers = self.hints.kept_nullifiers;
        let siloed_nullifiers = self.hints.siloed_nullifiers;
        let sorted_hints = self.hints.sorted_nullifier_hints;
        for i in 0..kept_nullifiers.len() {
            let siloed_nullifier = siloed_nullifiers[i];
            let nullifier = kept_nullifiers[i];
            if i < self.nullifier_siloing_amount {
                let siloed_value = silo_nullifier(nullifier);
                assert_eq(siloed_nullifier.value(), siloed_value, "incorrect siloed nullifier");
                assert_eq(siloed_nullifier.counter(), nullifier.counter(), "mismatch nullifier counter");
                assert_eq(
                    siloed_nullifier.nullifier.note_hash, nullifier.nullifier.note_hash, "mismatch nullified note hash"
                );
                assert(
                    siloed_nullifier.contract_address.is_zero(), "contract address must not be exposed for siloed nullifier"
                );
            }
        }

        // Check ordering.
        assert_sorted_transformed_value_array(
            kept_nullifiers,
            siloed_nullifiers,
            self.output.nullifiers,
            sorted_hints
        );
    }

    fn validate_sorted_note_logs(self) {
        // This will be called together with validate_sorted_siloed_note_hashes().
        // Same as validate_sorted_siloed_note_hashes, it will only be run once. 
        // This is fine because we don't allow emitting logs for notes emitted in another function at the moment.

        let kept_log_hashes = self.hints.kept_note_encrypted_log_hashes;
        let exposed_log_hashes = self.hints.exposed_note_encrypted_log_hashes;
        for i in 0..kept_log_hashes.len() {
            let prev = kept_log_hashes[i];
            let out = exposed_log_hashes[i];
            assert_eq(out.value, prev.value, "mismatch note log value");
            assert_eq(out.length, prev.length, "mismatch note log length");
            assert_eq(out.counter, prev.counter, "mismatch note log counter");
            // The note_hash_counter was used when squashing note logs along with their corresponding note hashes.
            // It won't be used later on, so we can set them to 0 here.
            // It serves as a clue for the tail circuit to check that all the note logs are sorted in a reset circuit.
            assert_eq(out.note_hash_counter, 0, "note_hash_counter should not be exposed for sorted note log");
        }

        assert_sorted_transformed_value_array(
            kept_log_hashes,
            exposed_log_hashes,
            self.output.note_encrypted_log_hashes,
            self.hints.sorted_note_encrypted_log_hash_hints
        );
    }

    fn validate_sorted_masked_encrypted_logs(self) {
        // Don't need to check that the logs are already masked.
        // If run repeatedly, it will return the masked contract address when randomness becomes 0.

        let log_hashes = self.previous_kernel.end.encrypted_logs_hashes;
        let masked_log_hashes = self.hints.masked_encrypted_log_hashes;
        for i in 0..log_hashes.len() {
            if i < self.encrypted_log_siloing_amount {
                let prev = log_hashes[i];
                let out = masked_log_hashes[i];
                assert_eq(
                    out.contract_address, mask_encrypted_log_hash(prev), "incorrect masked contract address"
                );
                assert_eq(out.log_hash.value, prev.log_hash.value, "mismatch log value");
                assert_eq(out.log_hash.length, prev.log_hash.length, "mismatch log length");
                assert_eq(out.log_hash.counter, prev.log_hash.counter, "mismatch log counter");
                assert_eq(out.log_hash.randomness, 0, "randomness must be set to zero after masked");
            }
        }

        assert_sorted_transformed_value_array(
            log_hashes,
            masked_log_hashes,
            self.output.encrypted_log_hashes,
            self.hints.sorted_encrypted_log_hash_hints
        );
    }
}
