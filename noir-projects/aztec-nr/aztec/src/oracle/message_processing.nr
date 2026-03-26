use crate::protocol::address::AztecAddress;

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and makes
/// them available for later processing in Noir by storing them in a capsule array.
// TODO(F-498): review naming consistency
pub unconstrained fn fetch_tagged_logs(pending_tagged_log_array_base_slot: Field, scope: AztecAddress) {
    get_pending_tagged_logs_oracle(pending_tagged_log_array_base_slot, scope);
}

#[oracle(aztec_utl_getPendingTaggedLogs)]
unconstrained fn get_pending_tagged_logs_oracle(pending_tagged_log_array_base_slot: Field, scope: AztecAddress) {}

// This must be a single oracle and not one for notes and one for events because the entire point is to validate all
// notes and events in one go, minimizing node round-trips.
pub(crate) unconstrained fn validate_and_store_enqueued_notes_and_events(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {
    validate_and_store_enqueued_notes_and_events_oracle(
        contract_address,
        note_validation_requests_array_base_slot,
        event_validation_requests_array_base_slot,
        max_note_packed_len,
        max_event_serialized_len,
        scope,
    );
}

#[oracle(aztec_utl_validateAndStoreEnqueuedNotesAndEvents)]
unconstrained fn validate_and_store_enqueued_notes_and_events_oracle(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {}

pub(crate) unconstrained fn get_logs_by_tag(
    contract_address: AztecAddress,
    log_retrieval_requests_array_base_slot: Field,
    log_retrieval_responses_array_base_slot: Field,
    scope: AztecAddress,
) {
    get_logs_by_tag_oracle(
        contract_address,
        log_retrieval_requests_array_base_slot,
        log_retrieval_responses_array_base_slot,
        scope,
    );
}

#[oracle(aztec_utl_getLogsByTag)]
unconstrained fn get_logs_by_tag_oracle(
    contract_address: AztecAddress,
    log_retrieval_requests_array_base_slot: Field,
    log_retrieval_responses_array_base_slot: Field,
    scope: AztecAddress,
) {}

pub(crate) unconstrained fn get_message_contexts_by_tx_hash(
    contract_address: AztecAddress,
    message_context_requests_array_base_slot: Field,
    message_context_responses_array_base_slot: Field,
    scope: AztecAddress,
) {
    get_message_contexts_by_tx_hash_oracle(
        contract_address,
        message_context_requests_array_base_slot,
        message_context_responses_array_base_slot,
        scope,
    );
}

#[oracle(aztec_utl_getMessageContextsByTxHash)]
unconstrained fn get_message_contexts_by_tx_hash_oracle(
    contract_address: AztecAddress,
    message_context_requests_array_base_slot: Field,
    message_context_responses_array_base_slot: Field,
    scope: AztecAddress,
) {}
