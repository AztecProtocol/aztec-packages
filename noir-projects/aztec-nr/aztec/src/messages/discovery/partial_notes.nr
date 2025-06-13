use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::{ComputeNoteHashAndNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        processing::{
            enqueue_note_for_validation, log_retrieval_request::LogRetrievalRequest,
            log_retrieval_response::LogRetrievalResponse,
        },
    },
    oracle,
    utils::array,
};

use protocol_types::{
    address::AztecAddress,
    debug_log::debug_log_format,
    hash::sha256_to_field,
    traits::{Deserialize, Serialize},
};

global PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN: u32 = 2;

/// Partial notes have a maximum packed length of their private fields bound by extra content in their private message
/// (e.g. the storage slot, note completion log tag, etc.).
pub global MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN;

/// The slot in the PXE capsules where we store a `CapsuleArray` of `DeliveredPendingPartialNote`.
pub global DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT: Field = sha256_to_field(
    "AZTEC_NR::DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT".as_bytes(),
);

global LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT".as_bytes(),
);

global LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT".as_bytes(),
);

/// A partial note that was delivered but is still pending completion. Contains the information necessary to find the
/// log that will complete it and lead to a note being discovered and delivered.
#[derive(Serialize, Deserialize)]
pub(crate) struct DeliveredPendingPartialNote {
    pub(crate) note_completion_log_tag: Field,
    pub(crate) storage_slot: Field,
    pub(crate) note_type_id: Field,
    pub(crate) packed_private_note_content: BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN>,
    pub(crate) recipient: AztecAddress,
}

pub unconstrained fn process_partial_note_private_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) {
    let (note_type_id, storage_slot, note_completion_log_tag, packed_private_note_content) =
        decode_partial_note_private_msg(msg_metadata, msg_content);

    // We store the information of the partial note we found in a persistent capsule in PXE, so that we can later search
    // for the public log that will complete it.
    let pending = DeliveredPendingPartialNote {
        note_completion_log_tag,
        storage_slot,
        note_type_id,
        packed_private_note_content,
        recipient,
    };

    CapsuleArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
    )
        .push(pending);
}

/// Searches for public logs that would result in the completion of pending partial notes, ultimately resulting in the
/// notes being delivered to PXE if completed.
pub unconstrained fn fetch_and_process_public_partial_note_completion_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    let pending_partial_notes = CapsuleArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
    );

    debug_log_format(
        "{} pending partial notes",
        [pending_partial_notes.len() as Field],
    );

    pending_partial_notes.for_each(|_, pending_partial_note: DeliveredPendingPartialNote| {
        CapsuleArray::at(contract_address, LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT).push(
            LogRetrievalRequest {
                contract_address,
                unsiloed_tag: pending_partial_note.note_completion_log_tag,
            },
        );
    });

    oracle::message_processing::bulk_retrieve_logs(
        contract_address,
        LOG_RETRIEVAL_REQUESTS_ARRAY_BASE_SLOT,
        LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT,
    );

    let responses = CapsuleArray::at(contract_address, LOG_RETRIEVAL_RESPONSES_ARRAY_BASE_SLOT);
    responses.for_each(|i, maybe_log: Option<_>| {
        responses.remove(i);

        let pending_partial_note = pending_partial_notes.get(i);

        if maybe_log.is_none() {
            debug_log_format(
                "Found no completion logs for partial note with tag {}",
                [pending_partial_note.note_completion_log_tag],
            );

            // Note that we're not removing the pending partial note from the capsule array, so we will continue
            // searching for this tagged log when performing message discovery in the future until we either find it or
            // the entry is somehow removed from the array.
        } else {
            debug_log_format(
                "Completion log found for partial note with tag {}",
                [pending_partial_note.note_completion_log_tag],
            );
            let log: LogRetrievalResponse = maybe_log.unwrap();

            // Public fields are assumed to all be placed at the end of the packed representation, so we combine the
            // private and public packed fields (i.e. the contents of the private message and public log plaintext to get
            // the complete packed content.
            let complete_packed_note = array::append(
                pending_partial_note.packed_private_note_content,
                log.log_payload,
            );

            let discovered_notes = attempt_note_nonce_discovery(
                log.unique_note_hashes_in_tx,
                log.first_nullifier_in_tx,
                compute_note_hash_and_nullifier,
                contract_address,
                pending_partial_note.storage_slot,
                pending_partial_note.note_type_id,
                complete_packed_note,
            );

            debug_log_format(
                "Discovered {0} notes for partial note with tag {1}",
                [discovered_notes.len() as Field, pending_partial_note.note_completion_log_tag],
            );

            discovered_notes.for_each(|discovered_note| {
                enqueue_note_for_validation(
                    contract_address,
                    pending_partial_note.storage_slot,
                    discovered_note.note_nonce,
                    complete_packed_note,
                    discovered_note.note_hash,
                    discovered_note.inner_nullifier,
                    log.tx_hash,
                    pending_partial_note.recipient,
                );
            });

            // Because there is only a single log for a given tag, once we've processed the tagged log then we
            // simply delete the pending work entry, regardless of whether it was actually completed or not.
            // TODO(#11627): only remove the pending entry if we actually process a log that results in the note
            // being completed.
            pending_partial_notes.remove(i);
        }
    });
}

fn decode_partial_note_private_msg(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (Field, Field, Field, BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN>) {
    let note_type_id = msg_metadata as Field; // TODO: make note type id not be a full field

    assert(
        msg_content.len() > PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN,
        f"Invalid private note message: all partial note private messages must have at least {PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN} fields",
    );

    // If PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // destructuring of the partial note private message encoding below must be updated as well.
    std::static_assert(
        PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN == 2,
        "unexpected value for PARTIAL_NOTE_PRIVATE_MSG_CONTENT_NON_NOTE_FIELDS_LEN",
    );

    // We currently have two fields that are not the partial note's packed representation, which are the storage slot
    // and the note completion log tag.
    let storage_slot = msg_content.get(0);
    let note_completion_log_tag = msg_content.get(1);

    let packed_private_note_content = array::subbvec(msg_content, 2);

    (note_type_id, storage_slot, note_completion_log_tag, packed_private_note_content)
}
