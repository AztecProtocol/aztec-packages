// TO BE DEPRECATED: Sort the arrays in kernel_circuit_public_inputs_composer.
use dep::types::{
    abis::{
    call_request::CallRequest, kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    note_hash::ScopedNoteHash, nullifier::ScopedNullifier,
    log_hash::{NoteLogHash, ScopedLogHash, ScopedEncryptedLogHash}
},
    constants::{
    MAX_NEW_L2_TO_L1_MSGS_PER_TX, MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX,
    MAX_ENCRYPTED_LOGS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
    MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX
},
    messaging::l2_to_l1_message::ScopedL2ToL1Message, tests::sort::sort_get_sorted_hints
};

struct PrivateKernelTailHints {
    sorted_new_note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_new_note_hashes_indexes: [u32; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_new_nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_new_nullifiers_indexes: [u32; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_new_l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_NEW_L2_TO_L1_MSGS_PER_TX],
    sorted_new_l2_to_l1_msgs_indexes: [u32; MAX_NEW_L2_TO_L1_MSGS_PER_TX],
    sorted_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_note_encrypted_log_hashes_indexes: [u32; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes: [ScopedEncryptedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes_indexes: [u32; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes_indexes: [u32; MAX_UNENCRYPTED_LOGS_PER_TX],
    sorted_public_call_requests: [CallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
    sorted_public_call_requests_indexes: [u32; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
}

unconstrained pub fn generate_private_kernel_tail_hints(previous_kernel: PrivateKernelCircuitPublicInputs) -> PrivateKernelTailHints {
    let sorted = sort_get_sorted_hints(
        previous_kernel.end.new_note_hashes,
        |a: ScopedNoteHash, b: ScopedNoteHash| a.counter() < b.counter()
    );
    let sorted_new_note_hashes = sorted.sorted_array;
    let sorted_new_note_hashes_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.new_nullifiers,
        |a: ScopedNullifier, b: ScopedNullifier| a.counter() < b.counter()
    );
    let sorted_new_nullifiers = sorted.sorted_array;
    let sorted_new_nullifiers_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.new_l2_to_l1_msgs,
        |a: ScopedL2ToL1Message, b: ScopedL2ToL1Message| a.counter() < b.counter()
    );
    let sorted_new_l2_to_l1_msgs = sorted.sorted_array;
    let sorted_new_l2_to_l1_msgs_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.note_encrypted_logs_hashes,
        |a: NoteLogHash, b: NoteLogHash| a.counter < b.counter
    );
    let sorted_note_encrypted_log_hashes = sorted.sorted_array;
    let sorted_note_encrypted_log_hashes_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.encrypted_logs_hashes,
        |a: ScopedEncryptedLogHash, b: ScopedEncryptedLogHash| a.counter() < b.counter()
    );
    let sorted_encrypted_log_hashes = sorted.sorted_array;
    let sorted_encrypted_log_hashes_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.unencrypted_logs_hashes,
        |a: ScopedLogHash, b: ScopedLogHash| a.counter() < b.counter()
    );
    let sorted_unencrypted_log_hashes = sorted.sorted_array;
    let sorted_unencrypted_log_hashes_indexes = sorted.sorted_index_hints;

    let sorted = sort_get_sorted_hints(
        previous_kernel.end.public_call_stack,
        |a: CallRequest, b: CallRequest| a.counter() < b.counter()
    );
    let sorted_public_call_requests = sorted.sorted_array;
    let sorted_public_call_requests_indexes = sorted.sorted_index_hints;

    PrivateKernelTailHints {
        sorted_new_note_hashes,
        sorted_new_note_hashes_indexes,
        sorted_new_nullifiers,
        sorted_new_nullifiers_indexes,
        sorted_new_l2_to_l1_msgs,
        sorted_new_l2_to_l1_msgs_indexes,
        sorted_note_encrypted_log_hashes,
        sorted_note_encrypted_log_hashes_indexes,
        sorted_encrypted_log_hashes,
        sorted_encrypted_log_hashes_indexes,
        sorted_unencrypted_log_hashes,
        sorted_unencrypted_log_hashes_indexes,
        sorted_public_call_requests,
        sorted_public_call_requests_indexes
    }
}
