use protocol_types::address::AztecAddress;

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and makes
/// them available for later processing in Noir by storing them in a capsule array.
pub unconstrained fn fetch_tagged_logs(pending_tagged_log_array_base_slot: Field) {
    fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot);
}

#[oracle(fetchTaggedLogs)]
unconstrained fn fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot: Field) {}

// This must be a single oracle and not one for notes and one for events because the entire point is to validate
// all notes and events in one go, minimizing node round-trips.
pub(crate) unconstrained fn validate_enqueued_notes_and_events(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
) {
    validate_enqueued_notes_and_events_oracle(
        contract_address,
        note_validation_requests_array_base_slot,
        event_validation_requests_array_base_slot,
    );
}

#[oracle(validateEnqueuedNotesAndEvents)]
unconstrained fn validate_enqueued_notes_and_events_oracle(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
) {}


pub(crate) unconstrained fn bulk_retrieve_logs(
    contract_address: AztecAddress,
    log_retrieval_requests_array_base_slot: Field,
    log_retrieval_responses_array_base_slot: Field,
) {
    bulk_retrieve_logs_oracle(
        contract_address,
        log_retrieval_requests_array_base_slot,
        log_retrieval_responses_array_base_slot,
    );
}

#[oracle(bulkRetrieveLogs)]
unconstrained fn bulk_retrieve_logs_oracle(
    contract_address: AztecAddress,
    log_retrieval_requests_array_base_slot: Field,
    log_retrieval_responses_array_base_slot: Field,
) {}
