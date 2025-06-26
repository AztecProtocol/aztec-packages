pub(crate) mod event_validation_request;
pub mod message_context;
pub(crate) mod note_validation_request;
pub(crate) mod log_retrieval_request;
pub(crate) mod log_retrieval_response;
pub(crate) mod pending_tagged_log;

use crate::{
    capsules::CapsuleArray,
    event::event_selector::EventSelector,
    messages::{
        discovery::{
            partial_notes::DeliveredPendingPartialNote, private_events::MAX_EVENT_SERIALIZED_LEN,
            private_notes::MAX_NOTE_PACKED_LEN,
        },
        processing::{
            log_retrieval_request::LogRetrievalRequest,
            log_retrieval_response::LogRetrievalResponse,
            note_validation_request::NoteValidationRequest, pending_tagged_log::PendingTaggedLog,
        },
    },
    oracle,
};
use event_validation_request::EventValidationRequest;
use protocol_types::{address::AztecAddress, hash::sha256_to_field};

// Base slot for the pending tagged log array to which the fetch_tagged_logs oracle inserts found private logs.
global PENDING_TAGGED_LOG_ARRAY_BASE_SLOT: Field =
    sha256_to_field("AZTEC_NR::PENDING_TAGGED_LOG_ARRAY_BASE_SLOT".as_bytes());

global NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT".as_bytes(),
);

/// Searches for private logs emitted by `contract_address` that might contain messages for one of the local accounts,
/// and stores them in a `CapsuleArray` which is then returned.
pub(crate) unconstrained fn get_private_logs(
    contract_address: AztecAddress,
) -> CapsuleArray<PendingTaggedLog> {
    // We will eventually perform log discovery via tagging here, but for now we simply call the `fetchTaggedLogs`
    // oracle. This makes PXE synchronize tags, download logs and store the pending tagged logs in a capsule array.
    oracle::message_processing::fetch_tagged_logs(PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

    CapsuleArray::at(contract_address, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT)
}

/// Enqueues a note for validation by PXE, so that it becomes aware of a note's existence allowing for later retrieval
/// via `get_notes` oracle. The note will be scoped to `contract_address`, meaning other contracts will not be able to
/// access it unless authorized.
///
/// In order for the note validation and insertion to occur, `validate_enqueued_notes_and_events` must be later called.
/// For optimal performance, accumulate as many note validation requests as possible and then validate them all at the
/// end (which results in PXE minimizing the number of network round-trips).
///
/// The `packed_note` is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value
/// is typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are
/// the inner hashes, i.e. the raw hashes returned by `NoteHash::compute_note_hash` and
/// `NoteHash::compute_nullifier`. PXE will verify that the siloed unique note hash was inserted into the tree
/// at `tx_hash`, and will store the nullifier to later check for nullification.
///
/// `recipient` is the account to which the note was sent to. Other accounts will not be able to access this note (e.g.
/// other accounts will not be able to see one another's token balance notes, even in the same PXE) unless authorized.
pub(crate) unconstrained fn enqueue_note_for_validation(
    contract_address: AztecAddress,
    storage_slot: Field,
    note_nonce: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) {
    // We store requests in a `CapsuleArray`, which PXE will later read from and deserialize into its version of the
    // Noir `NoteValidationRequest`
    CapsuleArray::at(contract_address, NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).push(
        NoteValidationRequest {
            contract_address,
            storage_slot,
            note_nonce,
            packed_note,
            note_hash,
            nullifier,
            tx_hash,
            recipient,
        },
    )
}

/// Enqueues an event for validation by PXE, so that it can be efficiently validated and then inserted into the event
/// store.
///
/// In order for the event validation and insertion to occur, `validate_enqueued_notes_and_events` must be later
/// called. For optimal performance, accumulate as many event validation requests as possible and then validate them
/// all at the end (which results in PXE minimizing the number of network round-trips).
pub(crate) unconstrained fn enqueue_event_for_validation(
    contract_address: AztecAddress,
    event_type_id: EventSelector,
    serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    event_commitment: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) {
    // We store requests in a `CapsuleArray`, which PXE will later read from and deserialize into its version of the
    // Noir `EventValidationRequest`
    CapsuleArray::at(contract_address, EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).push(
        EventValidationRequest {
            contract_address,
            event_type_id,
            serialized_event,
            event_commitment,
            tx_hash,
            recipient,
        },
    )
}

/// Validates all note and event validation requests enqueued via `enqueue_note_for_validation` and
/// `enqueue_event_for_validation`, inserting them into the note database and event store respectively, making them
/// queryable via `get_notes` oracle and our TS API (PXE::getPrivateEvents).
///
/// This automatically clears both validation request queues, so no further work needs to be done by the caller.
pub(crate) unconstrained fn validate_enqueued_notes_and_events(contract_address: AztecAddress) {
    oracle::message_processing::validate_enqueued_notes_and_events(
        contract_address,
        NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT,
        EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT,
    );
}

/// Efficiently queries the node for logs that result in the completion of all `DeliveredPendingPartialNote`s stored in
/// a `CapsuleArray` by performing all node communication concurrently. Returns a second `CapsuleArray` with Options for
/// the responses that correspond to the pending partial notes at the same index.
///
/// For example, given an array with pending partial notes `[ p1, p2, p3 ]`, where `p1` and `p3` have corresponding
/// completion logs but `p2` does not, the returned `CapsuleArray` will have contents
/// `[some(p1_log), none(), some(p3_log)]`.
pub(crate) unconstrained fn get_pending_partial_notes_completion_logs(
    contract_address: AztecAddress,
    pending_partial_notes: CapsuleArray<DeliveredPendingPartialNote>,
) -> CapsuleArray<Option<LogRetrievalResponse>> {
    let log_retrieval_requests =
        CapsuleArray::at(contract_address, LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT);

    // We create a LogRetrievalRequest for each PendingPartialNote in the CapsuleArray. Because we need the indices in
    // the request array to match the indices in the partial note array, we can't use CapsuleArray::for_each, as that
    // function has arbitrary iteration order. Instead, we manually iterate the array from the beginning and push into
    // the requests array, which we expect to be empty.
    let mut i = 0;
    let pending_partial_notes_count = pending_partial_notes.len();
    while i < pending_partial_notes_count {
        let pending_partial_note = pending_partial_notes.get(i);
        log_retrieval_requests.push(
            LogRetrievalRequest {
                contract_address,
                unsiloed_tag: pending_partial_note.note_completion_log_tag,
            },
        );
        i += 1;
    }

    oracle::message_processing::bulk_retrieve_logs(
        contract_address,
        LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT,
        LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT,
    );

    CapsuleArray::at(contract_address, LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT)
}
