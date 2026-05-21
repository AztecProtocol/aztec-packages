use crate::ephemeral::EphemeralArray;
use crate::messages::processing::{
    event_validation_request::EventValidationRequest,
    log_retrieval_request::LogRetrievalRequest, log_retrieval_response::LogRetrievalResponse, MessageContext,
    NoteValidationRequest, pending_tagged_log::PendingTaggedLog,
};
use crate::protocol::address::AztecAddress;
use crate::protocol::blob_data::TxEffect;

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and
/// returns them in an ephemeral array with an oracle-allocated base slot.
pub(crate) unconstrained fn get_pending_tagged_logs(scope: AztecAddress) -> EphemeralArray<PendingTaggedLog> {
    get_pending_tagged_logs_oracle(scope)
}

#[oracle(aztec_utl_getPendingTaggedLogs)]
unconstrained fn get_pending_tagged_logs_oracle(scope: AztecAddress) -> EphemeralArray<PendingTaggedLog> {}

/// Validates note/event requests stored in ephemeral arrays.
pub(crate) unconstrained fn validate_and_store_enqueued_notes_and_events(
    note_validation_requests: EphemeralArray<NoteValidationRequest>,
    event_validation_requests: EphemeralArray<EventValidationRequest>,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {
    validate_and_store_enqueued_notes_and_events_oracle(
        note_validation_requests,
        event_validation_requests,
        max_note_packed_len,
        max_event_serialized_len,
        scope,
    );
}

#[oracle(aztec_utl_validateAndStoreEnqueuedNotesAndEvents)]
unconstrained fn validate_and_store_enqueued_notes_and_events_oracle(
    note_validation_requests: EphemeralArray<NoteValidationRequest>,
    event_validation_requests: EphemeralArray<EventValidationRequest>,
    max_note_packed_len: Field,
    max_event_serialized_len: Field,
    scope: AztecAddress,
) {}

/// Fetches all logs matching each request's tag and returns a nested ephemeral array.
///
/// Each element in the outer array is an inner `EphemeralArray<LogRetrievalResponse>` containing all matching logs for
/// the request at the same index (which may be empty if no logs were found).
pub(crate) unconstrained fn get_logs_by_tag(
    requests: EphemeralArray<LogRetrievalRequest>,
) -> EphemeralArray<EphemeralArray<LogRetrievalResponse>> {
    get_logs_by_tag_oracle(requests)
}

#[oracle(aztec_utl_getLogsByTag)]
unconstrained fn get_logs_by_tag_oracle(
    requests: EphemeralArray<LogRetrievalRequest>,
) -> EphemeralArray<EphemeralArray<LogRetrievalResponse>> {}

/// Resolves message contexts for tx hashes in an ephemeral request array and returns a response ephemeral array.
pub(crate) unconstrained fn get_message_contexts_by_tx_hash(
    requests: EphemeralArray<Field>,
) -> EphemeralArray<Option<MessageContext>> {
    get_message_contexts_by_tx_hash_oracle(requests)
}

#[oracle(aztec_utl_getMessageContextsByTxHash)]
unconstrained fn get_message_contexts_by_tx_hash_oracle(
    requests: EphemeralArray<Field>,
) -> EphemeralArray<Option<MessageContext>> {}

/// Fetches all effects of a settled transaction by its hash.
pub unconstrained fn get_tx_effect(tx_hash: Field) -> Option<TxEffect> {
    get_tx_effect_oracle(tx_hash)
}

#[oracle(aztec_utl_getTxEffect)]
unconstrained fn get_tx_effect_oracle(tx_hash: Field) -> Option<TxEffect> {}
