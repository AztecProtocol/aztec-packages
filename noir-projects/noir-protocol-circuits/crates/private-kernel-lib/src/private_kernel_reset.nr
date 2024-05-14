use crate::private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer;
use dep::reset_kernel_lib::{
    NoteHashReadRequestHints, NullifierReadRequestHints, PrivateValidationRequestProcessor,
    verify_squashed_transient_note_hashes_and_nullifiers
};
use dep::types::{
    abis::{
    private_kernel_data::{PrivateKernelData, verify_previous_kernel_proof},
    kernel_circuit_public_inputs::KernelCircuitPublicInputs, note_hash::ScopedNoteHash,
    nullifier::ScopedNullifier, side_effect::SideEffect
},
    constants::{
    MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
    MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX
},
    grumpkin_private_key::GrumpkinPrivateKey, utils::arrays::array_length, traits::is_empty,
    PrivateKernelCircuitPublicInputs
};

// Can just be KernelCircuitPublicInputs.
struct PrivateKernelResetOutputs {
    note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
    nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
}

struct PrivateKernelResetHints {
    transient_nullifier_indexes_for_note_hashes: [u64; MAX_NEW_NOTE_HASHES_PER_TX],
    transient_note_hash_indexes_for_nullifiers: [u64; MAX_NEW_NULLIFIERS_PER_TX],
    note_hash_read_request_hints: NoteHashReadRequestHints,
    nullifier_read_request_hints: NullifierReadRequestHints,
    master_nullifier_secret_keys: [GrumpkinPrivateKey; MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX],
}

struct PrivateKernelResetCircuitPrivateInputs {
    previous_kernel: PrivateKernelData,
    outputs: PrivateKernelResetOutputs,
    hints: PrivateKernelResetHints,
}

impl PrivateKernelResetCircuitPrivateInputs {
    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        let mut previous_public_inputs = self.previous_kernel.public_inputs;

        // verify/aggregate the previous kernel
        verify_previous_kernel_proof(self.previous_kernel);

        previous_public_inputs.validation_requests = PrivateValidationRequestProcessor {
            validation_requests: previous_public_inputs.validation_requests,
            note_hash_read_request_hints: self.hints.note_hash_read_request_hints,
            pending_note_hashes: previous_public_inputs.end.new_note_hashes,
            note_hash_tree_root: previous_public_inputs.constants.historical_header.state.partial.note_hash_tree.root,
            nullifier_read_request_hints: self.hints.nullifier_read_request_hints,
            pending_nullifiers: previous_public_inputs.end.new_nullifiers,
            nullifier_tree_root: previous_public_inputs.constants.historical_header.state.partial.nullifier_tree.root,
            master_nullifier_secret_keys: self.hints.master_nullifier_secret_keys
        }.validate();

        verify_squashed_transient_note_hashes_and_nullifiers(
            previous_public_inputs.end.new_note_hashes,
            previous_public_inputs.end.new_nullifiers,
            self.outputs.note_hashes,
            self.outputs.nullifiers,
            self.hints.transient_nullifier_indexes_for_note_hashes,
            self.hints.transient_note_hash_indexes_for_nullifiers
        );

        previous_public_inputs.end.new_note_hashes = self.outputs.note_hashes;
        previous_public_inputs.end.new_nullifiers = self.outputs.nullifiers;

        previous_public_inputs
    }
}
