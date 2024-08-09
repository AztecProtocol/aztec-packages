mod get_transient_or_propagated_note_hash_indexes_for_logs;
mod squash_transient_data;

use crate::components::reset_output_composer::reset_output_hints::{
    get_transient_or_propagated_note_hash_indexes_for_logs::get_transient_or_propagated_note_hash_indexes_for_logs,
    squash_transient_data::squash_transient_data
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    log_hash::{NoteLogHash, ScopedEncryptedLogHash, ScopedLogHash}, note_hash::ScopedNoteHash,
    nullifier::ScopedNullifier
},
    address::AztecAddress,
    constants::{
    MAX_ENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
    MAX_NULLIFIERS_PER_TX
},
    hash::{mask_encrypted_log_hash, silo_note_hash, silo_nullifier},
    utils::arrays::{OrderHint, sort_get_order_hints_asc}
};

struct ResetOutputHints {
    // note_hashes
    kept_note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    siloed_note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    sorted_note_hash_hints: [OrderHint; MAX_NOTE_HASHES_PER_TX],
    // nullifiers
    kept_nullifiers: [ScopedNullifier; MAX_NULLIFIERS_PER_TX],
    siloed_nullifiers: [ScopedNullifier; MAX_NULLIFIERS_PER_TX],
    sorted_nullifier_hints: [OrderHint; MAX_NULLIFIERS_PER_TX],
    // note_encrypted_log_hashes
    kept_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    exposed_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_note_encrypted_log_hash_hints: [OrderHint; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    transient_or_propagated_note_hash_indexes_for_logs: [u32; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    // encrypted_log_hashes
    masked_encrypted_log_hashes: [ScopedEncryptedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hash_hints: [OrderHint; MAX_ENCRYPTED_LOGS_PER_TX],
}

pub fn generate_reset_output_hints(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    transient_nullifier_indexes_for_note_hashes: [u32; MAX_NOTE_HASHES_PER_TX],
    transient_note_hash_indexes_for_nullifiers: [u32; MAX_NULLIFIERS_PER_TX]
) -> ResetOutputHints {
    let (kept_note_hashes, kept_nullifiers, kept_note_encrypted_log_hashes) = squash_transient_data(
        previous_kernel.end.note_hashes,
        previous_kernel.end.nullifiers,
        previous_kernel.end.note_encrypted_logs_hashes,
        transient_nullifier_indexes_for_note_hashes,
        transient_note_hash_indexes_for_nullifiers
    );

    // note_hashes
    let mut siloed_note_hashes = kept_note_hashes;
    let tx_hash = previous_kernel.end.nullifiers[0].value(); // First nullifier is tx hash.
    let sorted_note_hash_hints = sort_get_order_hints_asc(kept_note_hashes);
    for i in 0..kept_note_hashes.len() {
        siloed_note_hashes[i].note_hash.value = silo_note_hash(kept_note_hashes[i], tx_hash, sorted_note_hash_hints[i].sorted_index);
        siloed_note_hashes[i].contract_address = AztecAddress::zero();
    }

    // nullifiers
    let mut siloed_nullifiers = kept_nullifiers;
    for i in 0..kept_nullifiers.len() {
        siloed_nullifiers[i].nullifier.value = silo_nullifier(kept_nullifiers[i]);
        siloed_nullifiers[i].nullifier.note_hash = 0;
        siloed_nullifiers[i].contract_address = AztecAddress::zero();
    }
    let sorted_nullifier_hints = sort_get_order_hints_asc(kept_nullifiers);

    // note_encrypted_log_hashes
    let mut exposed_note_encrypted_log_hashes = kept_note_encrypted_log_hashes;
    for i in 0..exposed_note_encrypted_log_hashes.len() {
        exposed_note_encrypted_log_hashes[i].note_hash_counter = 0;
    }
    let sorted_note_encrypted_log_hash_hints = sort_get_order_hints_asc(kept_note_encrypted_log_hashes);
    let transient_or_propagated_note_hash_indexes_for_logs = get_transient_or_propagated_note_hash_indexes_for_logs(
        previous_kernel.end.note_encrypted_logs_hashes,
        previous_kernel.end.note_hashes,
        kept_note_hashes
    );

    // encrypted_log_hashes
    let encrypted_logs_hashes = previous_kernel.end.encrypted_logs_hashes;
    let mut masked_encrypted_log_hashes = encrypted_logs_hashes;
    for i in 0..masked_encrypted_log_hashes.len() {
        masked_encrypted_log_hashes[i].contract_address = mask_encrypted_log_hash(encrypted_logs_hashes[i]);
        masked_encrypted_log_hashes[i].log_hash.randomness = 0;
    }
    let sorted_encrypted_log_hash_hints = sort_get_order_hints_asc(previous_kernel.end.encrypted_logs_hashes);

    ResetOutputHints {
        kept_note_hashes,
        siloed_note_hashes,
        sorted_note_hash_hints,
        kept_nullifiers,
        siloed_nullifiers,
        sorted_nullifier_hints,
        kept_note_encrypted_log_hashes,
        exposed_note_encrypted_log_hashes,
        sorted_note_encrypted_log_hash_hints,
        transient_or_propagated_note_hash_indexes_for_logs,
        masked_encrypted_log_hashes,
        sorted_encrypted_log_hash_hints
    }
}
