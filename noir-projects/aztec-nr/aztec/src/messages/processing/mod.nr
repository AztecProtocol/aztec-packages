pub(crate) mod event_validation_request;
pub mod offchain;

mod message_context;
pub use message_context::MessageContext;

pub(crate) mod note_validation_request;
pub(crate) mod log_retrieval_request;
pub(crate) mod log_retrieval_response;
pub(crate) mod pending_tagged_log;

use crate::{
    capsules::CapsuleArray,
    ephemeral::EphemeralArray,
    event::EventSelector,
    messages::{
        discovery::partial_notes::DeliveredPendingPartialNote,
        encoding::MESSAGE_CIPHERTEXT_LEN,
        logs::{event::MAX_EVENT_SERIALIZED_LEN, note::MAX_NOTE_PACKED_LEN},
        processing::{
            log_retrieval_request::LogRetrievalRequest, log_retrieval_response::LogRetrievalResponse,
            note_validation_request::NoteValidationRequest,
        },
    },
    oracle::message_processing,
};
use crate::protocol::{
    address::AztecAddress,
    constants::DOM_SEP__NOTE_COMPLETION_LOG_TAG,
    hash::{compute_log_tag, sha256_to_field},
    traits::{Deserialize, Serialize},
};
use event_validation_request::EventValidationRequest;

global NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

/// An offchain-delivered message with resolved context, ready for processing during sync.
#[derive(Serialize, Deserialize)]
pub struct OffchainMessageWithContext {
    pub message_ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    pub message_context: MessageContext,
}

/// Enqueues a note for validation and storage by PXE.
///
/// Once validated, the note becomes retrievable via the `get_notes` oracle. The note will be scoped to
/// `contract_address`, meaning other contracts will not be able to access it unless authorized.
///
/// In order for the note validation and insertion to occur, `validate_and_store_enqueued_notes_and_events` must be
/// later called. For optimal performance, accumulate as many note validation requests as possible and then validate
/// them all at the end (which results in PXE minimizing the number of network round-trips).
///
/// The `packed_note` is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value is
/// typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are the
/// inner hashes, i.e. the raw hashes returned by `NoteHash::compute_note_hash` and `NoteHash::compute_nullifier`. PXE
/// will verify that the siloed unique note hash was inserted into the tree at `tx_hash`, and will store the nullifier
/// to later check for nullification.
///
/// `owner` is the address used in note hash and nullifier computation, often requiring knowledge of their nullifier
/// secret key.
///
/// `scope` is the account to which the note message was delivered (i.e. the address the message was encrypted to).
/// This determines which PXE account can see the note - other accounts will not be able to access it (e.g. other
/// accounts will not be able to see one another's token balance notes, even in the same PXE) unless authorized. In
/// most cases `recipient` equals `owner`, but they can differ in scenarios like delegated discovery.
pub unconstrained fn enqueue_note_for_validation(
    contract_address: AztecAddress,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_nonce: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
) {
    EphemeralArray::at(NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).push(
        NoteValidationRequest {
            contract_address,
            owner,
            storage_slot,
            randomness,
            note_nonce,
            packed_note,
            note_hash,
            nullifier,
            tx_hash,
        },
    )
}

/// Enqueues an event for validation and storage by PXE.
///
/// This is the primary way for custom message handlers (registered via
/// [`crate::macros::AztecConfig::custom_message_handler`]) to deliver reassembled events back to PXE after processing
/// application-specific message formats.
///
/// In order for the event validation and insertion to occur, `validate_and_store_enqueued_notes_and_events` must be
/// later called. For optimal performance, accumulate as many event validation requests as possible and then validate
/// them all at the end (which results in PXE minimizing the number of network round-trips).
///
/// Note that `validate_and_store_enqueued_notes_and_events` is called by Aztec.nr after processing messages, so custom
/// message processors do not need to be concerned with this.
pub unconstrained fn enqueue_event_for_validation(
    contract_address: AztecAddress,
    event_type_id: EventSelector,
    randomness: Field,
    serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    event_commitment: Field,
    tx_hash: Field,
) {
    EphemeralArray::at(EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).push(
        EventValidationRequest {
            contract_address,
            event_type_id,
            randomness,
            serialized_event,
            event_commitment,
            tx_hash,
        },
    )
}

/// Validates and stores all enqueued notes and events.
///
/// Processes all requests enqueued via [`enqueue_note_for_validation`] and [`enqueue_event_for_validation`], inserting
/// them into the note database and event store respectively, making them queryable via `get_notes` oracle and our TS
/// API (PXE::getPrivateEvents).
pub unconstrained fn validate_and_store_enqueued_notes_and_events(scope: AztecAddress) {
    message_processing::validate_and_store_enqueued_notes_and_events(
        NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT,
        EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT,
        MAX_NOTE_PACKED_LEN as Field,
        MAX_EVENT_SERIALIZED_LEN as Field,
        scope,
    );

    // Defensive clearing: purge the queues after processing to prevent double-processing if this function is called
    // more than once in the same call frame. It is currently defensive because we only call this once per sync run.
    let _ = EphemeralArray::<NoteValidationRequest>::at(NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).clear();
    let _ = EphemeralArray::<EventValidationRequest>::at(EVENT_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).clear();
}

/// Efficiently queries the node for logs that result in the completion of all `DeliveredPendingPartialNote`s stored in
/// a `CapsuleArray` by performing all node communication concurrently. Returns an `EphemeralArray` with Options
/// for the responses that correspond to the pending partial notes at the same index.
///
/// For example, given an array with pending partial notes `[ p1, p2, p3 ]`, where `p1` and `p3` have corresponding
/// completion logs but `p2` does not, the returned `EphemeralArray` will have contents `[some(p1_log), none(),
/// some(p3_log)]`.
pub(crate) unconstrained fn get_pending_partial_notes_completion_logs(
    contract_address: AztecAddress,
    pending_partial_notes: CapsuleArray<DeliveredPendingPartialNote>,
) -> EphemeralArray<Option<LogRetrievalResponse>> {
    let log_retrieval_requests = EphemeralArray::at(LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT);

    // We create a LogRetrievalRequest for each PendingPartialNote in the EphemeralArray. Because we need the indices in
    // the request array to match the indices in the partial note array, we can't use EphemeralArray::for_each, as that
    // function has arbitrary iteration order. Instead, we manually iterate the array from the beginning and push into
    // the requests array, which we expect to be empty.
    let mut i = 0;
    let pending_partial_notes_count = pending_partial_notes.len();
    while i < pending_partial_notes_count {
        let pending_partial_note = pending_partial_notes.get(i);
        // Partial note completion logs are emitted with a domain-separated tag. To find matching logs, we apply the
        // same domain separation to the stored raw tag.
        let log_tag = compute_log_tag(
            pending_partial_note.note_completion_log_tag,
            DOM_SEP__NOTE_COMPLETION_LOG_TAG,
        );
        log_retrieval_requests.push(LogRetrievalRequest { contract_address, unsiloed_tag: log_tag });
        i += 1;
    }

    let responses = message_processing::get_logs_by_tag(log_retrieval_requests);

    // Defensive clearing: prevent stale requests if this function is called more than once in the same call frame.
    let _ = log_retrieval_requests.clear();

    responses
}
