use dep::types::{
    abis::{
    call_request::CallRequest,
    kernel_circuit_public_inputs::{PrivateKernelCircuitPublicInputs, PublicKernelCircuitPublicInputs},
    log_hash::{ScopedEncryptedLogHash, NoteLogHash, ScopedLogHash}, note_hash::ScopedNoteHash,
    nullifier::ScopedNullifier, side_effect::Ordered
},
    constants::{
    MAX_ENCRYPTED_LOGS_PER_TX, MAX_NEW_NOTE_HASHES_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
    MAX_NEW_NULLIFIERS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX
},
    utils::arrays::assert_sorted_array
};

fn asc_sort_by_counters<T>(a: T, b: T) -> bool where T: Ordered {
    a.counter() < b.counter()
}

fn desc_sort_by_counters<T>(a: T, b: T) -> bool where T: Ordered {
    a.counter() > b.counter()
}

struct PrivateKernelTailToPublicHints {
    sorted_new_note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_new_note_hashes_indexes: [u32; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_new_nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_new_nullifiers_indexes: [u32; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_note_encrypted_log_hashes_indexes: [u32; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes: [ScopedEncryptedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes_indexes: [u32; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes_indexes: [u32; MAX_UNENCRYPTED_LOGS_PER_TX],
    sorted_call_requests: [CallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
    sorted_call_requests_indexes: [u32; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
}

struct TailToPublicOutputValidator {
    output: PublicKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    hints: PrivateKernelTailToPublicHints,
}

impl TailToPublicOutputValidator {
    pub fn new(
        output: PublicKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        hints: PrivateKernelTailToPublicHints
    ) -> Self {
        TailToPublicOutputValidator { output, previous_kernel, hints }
    }

    pub fn validate<N>(self) {
        self.validate_empty_values();
        self.validate_propagated_values();
        self.validate_sorted_values();
    }

    fn validate_empty_values(self) {
        assert_eq(self.output.revert_code, 0, "revert_code must be empty");
    }

    fn validate_propagated_values(self) {
        assert_eq(self.output.constants, self.previous_kernel.constants, "mismatch constants");

        assert_eq(
            self.output.validation_requests.for_rollup, self.previous_kernel.validation_requests.for_rollup, "mismatch rollup_validation_requests"
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee_payer");
    }

    // TODO: Remove this when KernelCircuitPublicInputsComposer is run in an unconstrained function. Build sorted arrays in the composer.
    // Check the output against previoius kernel here.
    fn validate_sorted_values(self) {
        assert_sorted_array(
            self.previous_kernel.end.new_note_hashes,
            self.hints.sorted_new_note_hashes,
            self.hints.sorted_new_note_hashes_indexes,
            asc_sort_by_counters
        );

        assert_sorted_array(
            self.previous_kernel.end.new_nullifiers,
            self.hints.sorted_new_nullifiers,
            self.hints.sorted_new_nullifiers_indexes,
            asc_sort_by_counters
        );

        assert_sorted_array(
            self.previous_kernel.end.note_encrypted_logs_hashes,
            self.hints.sorted_note_encrypted_log_hashes,
            self.hints.sorted_note_encrypted_log_hashes_indexes,
            asc_sort_by_counters
        );

        assert_sorted_array(
            self.previous_kernel.end.encrypted_logs_hashes,
            self.hints.sorted_encrypted_log_hashes,
            self.hints.sorted_encrypted_log_hashes_indexes,
            asc_sort_by_counters
        );

        assert_sorted_array(
            self.previous_kernel.end.unencrypted_logs_hashes,
            self.hints.sorted_unencrypted_log_hashes,
            self.hints.sorted_unencrypted_log_hashes_indexes,
            asc_sort_by_counters
        );

        assert_sorted_array(
            self.previous_kernel.end.public_call_stack,
            self.hints.sorted_call_requests,
            self.hints.sorted_call_requests_indexes,
            desc_sort_by_counters
        );
    }
}
