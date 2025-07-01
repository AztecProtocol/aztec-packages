use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::{ComputeNoteHashAndNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        processing::{
            enqueue_note_for_validation, get_pending_partial_notes_completion_logs,
            log_retrieval_response::LogRetrievalResponse,
        },
    },
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

/// Searches for logs that would result in the completion of pending partial notes, ultimately resulting in the notes
/// being delivered to PXE if completed.
pub unconstrained fn fetch_and_process_partial_note_completion_logs<Env>(
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

    // Each of the pending partial notes might get completed by a log containing its public values. For performance
    // reasons, we fetch all of these logs concurrently and then process them one by one, minimizing the amount of time
    // waiting for the node roundtrip.
    let maybe_completion_logs =
        get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);

    // Each entry in the maybe completion logs array corresponds to the entry in the pending partial notes array at the
    // same index. This means we can use the same index as we iterate through the responses to get both the partial note
    // and the log that might complete it.
    assert_eq(maybe_completion_logs.len(), pending_partial_notes.len());

    maybe_completion_logs.for_each(|i, maybe_log: Option<LogRetrievalResponse>| {
        // We clear the completion logs as we read them so that the array is empty by the time we next query it.
        // TODO(#14943): use volatile arrays to avoid having to manually clear this.
        maybe_completion_logs.remove(i);

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
            let log = maybe_log.unwrap();

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

            // TODO(#11627): is there anything reasonable we can do if we get a log but it doesn't result in a note
            // being found?
            if discovered_notes.len() == 0 {
                panic(
                    f"A partial note's completion log did not result in any notes being found - this should never happen",
                );
            }

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
