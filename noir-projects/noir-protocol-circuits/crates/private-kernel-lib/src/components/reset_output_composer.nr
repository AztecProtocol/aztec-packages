pub mod reset_output_hints;

pub use reset_output_hints::ResetOutputHints;

use crate::components::reset_output_composer::reset_output_hints::generate_reset_output_hints;
use dep::reset_kernel_lib::{PrivateValidationRequestProcessor, TransientDataIndexHint};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier, private_log::PrivateLogData, side_effect::scoped::Scoped,
    },
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX},
    hash::{compute_siloed_private_log_field, silo_note_hash, silo_nullifier},
    utils::arrays::sort_by_counter_asc,
};

pub struct ResetOutputComposer<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_REQUESTS: u32> {
    pub previous_kernel: PrivateKernelCircuitPublicInputs,
    pub validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_REQUESTS>,
    pub note_hash_siloing_amount: u32,
    pub nullifier_siloing_amount: u32,
    pub private_log_siloing_amount: u32,
    pub hints: ResetOutputHints,
}

impl<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_REQUESTS: u32> ResetOutputComposer<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_REQUESTS> {
    pub unconstrained fn new<let TRANSIENT_DATA_AMOUNT: u32>(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_REQUESTS>,
        transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_AMOUNT],
        note_hash_siloing_amount: u32,
        nullifier_siloing_amount: u32,
        private_log_siloing_amount: u32,
    ) -> Self {
        let hints = generate_reset_output_hints(previous_kernel, transient_data_index_hints);
        ResetOutputComposer {
            previous_kernel,
            validation_request_processor,
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
            self.get_sorted_siloed_note_hashes()
        };

        output.end.nullifiers = if self.nullifier_siloing_amount == 0 {
            self.hints.kept_nullifiers
        } else {
            self.get_sorted_siloed_nullifiers()
        };

        output.end.private_logs = if self.private_log_siloing_amount == 0 {
            self.hints.kept_private_logs
        } else {
            self.get_sorted_siloed_private_logs()
        };

        output
    }

    unconstrained fn get_sorted_siloed_note_hashes(
        self,
    ) -> [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX] {
        let mut note_hashes = sort_by_counter_asc(self.hints.kept_note_hashes);
        let first_nullifier = self.previous_kernel.end.nullifiers[0].value();
        for i in 0..note_hashes.len() {
            note_hashes[i].note_hash.value = silo_note_hash(note_hashes[i], first_nullifier, i);
            note_hashes[i].contract_address = AztecAddress::zero();
        }
        note_hashes
    }

    unconstrained fn get_sorted_siloed_nullifiers(
        self,
    ) -> [ScopedNullifier; MAX_NULLIFIERS_PER_TX] {
        let mut nullifiers = sort_by_counter_asc(self.hints.kept_nullifiers);
        for i in 0..nullifiers.len() {
            nullifiers[i].nullifier.value = silo_nullifier(nullifiers[i]);
            nullifiers[i].contract_address = AztecAddress::zero();
        }
        nullifiers
    }

    unconstrained fn get_sorted_siloed_private_logs(
        self,
    ) -> [Scoped<PrivateLogData>; MAX_PRIVATE_LOGS_PER_TX] {
        let mut private_logs = sort_by_counter_asc(self.hints.kept_private_logs);
        for i in 0..private_logs.len() {
            private_logs[i].inner = silo_private_log(private_logs[i]);
            // The following modifies self.hints.kept_private_logs :(
            // private_logs[i].inner.log = silo_private_log(private_logs[i]);
            private_logs[i].contract_address = AztecAddress::zero();
        }
        private_logs
    }
}

fn silo_private_log(scoped: Scoped<PrivateLogData>) -> PrivateLogData {
    let mut serialized = scoped.inner.serialize();
    if !scoped.contract_address.is_zero() {
        serialized[0] = compute_siloed_private_log_field(scoped.contract_address, serialized[0]);
    }
    PrivateLogData::deserialize(serialized)
}
