use crate::ephemeral::EphemeralArray;
use crate::messages::processing::{
    log_retrieval_request::LogRetrievalRequest, log_retrieval_response::LogRetrievalResponse, MessageContext,
    pending_tagged_log::PendingTaggedLog,
};
use crate::protocol::address::AztecAddress;

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and
/// returns them in an ephemeral array with an oracle-allocated base slot.
pub(crate) unconstrained fn get_pending_tagged_logs(scope: AztecAddress) -> EphemeralArray<PendingTaggedLog> {
    let result_slot = get_pending_tagged_logs_oracle(scope);
    EphemeralArray::at(result_slot)
}

#[oracle(aztec_utl_getPendingTaggedLogs_v2)]
unconstrained fn get_pending_tagged_logs_oracle(scope: AztecAddress) -> Field {}

/// Validates note/event requests stored in ephemeral arrays.
pub(crate) unconstrained fn validate_and_store_enqueued_notes_and_events(
    note_validation_requests_array_slot: Field,
    event_validation_requests_array_slot: Field,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {
    validate_and_store_enqueued_notes_and_events_oracle(
        note_validation_requests_array_slot,
        event_validation_requests_array_slot,
        max_note_packed_len,
        max_event_serialized_len,
        scope,
    );
}

#[oracle(aztec_utl_validateAndStoreEnqueuedNotesAndEvents_v2)]
unconstrained fn validate_and_store_enqueued_notes_and_events_oracle(
    note_validation_requests_array_slot: Field,
    event_validation_requests_array_slot: Field,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {}

/// Fetches logs by tag from an ephemeral request array and returns a response ephemeral array.
pub(crate) unconstrained fn get_logs_by_tag(
    requests: EphemeralArray<LogRetrievalRequest>,
) -> EphemeralArray<Option<LogRetrievalResponse>> {
    let response_slot = get_logs_by_tag_v2_oracle(requests.slot);
    EphemeralArray::at(response_slot)
}

#[oracle(aztec_utl_getLogsByTag_v2)]
unconstrained fn get_logs_by_tag_v2_oracle(request_array_slot: Field) -> Field {}

/// Resolves message contexts for tx hashes in an ephemeral request array and returns a response ephemeral array.
pub(crate) unconstrained fn get_message_contexts_by_tx_hash(
    requests: EphemeralArray<Field>,
) -> EphemeralArray<Option<MessageContext>> {
    let response_slot = get_message_contexts_by_tx_hash_v2_oracle(requests.slot);
    EphemeralArray::at(response_slot)
}

#[oracle(aztec_utl_getMessageContextsByTxHash_v2)]
unconstrained fn get_message_contexts_by_tx_hash_v2_oracle(request_array_slot: Field) -> Field {}
