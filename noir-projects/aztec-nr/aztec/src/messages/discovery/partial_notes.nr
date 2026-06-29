use crate::{
    ephemeral::EphemeralArray,
    facts::OriginBlock,
    messages::{
        discovery::{
            ComputeNoteHash, ComputeNoteNullifier, nonce_discovery::attempt_note_nonce_discovery,
            partial_note_reception::PartialNoteReception,
        },
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::partial_note::{decode_partial_note_private_message, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN},
        processing::{
            enqueue_note_for_validation,
            get_pending_partial_notes_completion_logs,
            log_retrieval_response::{LogRetrievalResponse, MAX_LOG_CONTENT_LEN},
            ResolvedTx,
        },
    },
    utils::array,
};

use crate::logging::{aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// A partial note that was delivered but is still pending completion. Contains the information necessary to find the
/// log that will complete it and lead to a note being discovered and delivered.
#[derive(Serialize, Deserialize)]
pub(crate) struct DeliveredPendingPartialNote {
    pub(crate) owner: AztecAddress,
    pub(crate) randomness: Field,
    pub(crate) note_completion_log_tag: Field,
    pub(crate) note_type_id: Field,
    pub(crate) packed_private_note_content: BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN>,
}

pub(crate) unconstrained fn process_partial_note_private_msg(
    contract_address: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    resolved_tx: ResolvedTx,
    scope: AztecAddress,
) {
    let decoded = decode_partial_note_private_message(msg_metadata, msg_content);

    if decoded.is_some() {
        let (owner, randomness, note_completion_log_tag, note_type_id, packed_private_note_content) = decoded.unwrap();

        let pending = DeliveredPendingPartialNote {
            owner,
            randomness,
            note_completion_log_tag,
            note_type_id,
            packed_private_note_content,
        };

        // Record the pending partial note as a retractable fact anchored to the delivery block, so PXE prunes it if
        // that block is reorg'd away. We then search for the public log that completes it on each sync.
        PartialNoteReception::init(
            contract_address,
            scope,
            pending,
            OriginBlock { block_number: resolved_tx.block_number, block_hash: resolved_tx.block_hash },
        );
    } else {
        aztecnr_warn_log_format!(
            "Could not decode partial note private message from tx {0}, ignoring",
        )(
            [resolved_tx.tx_hash],
        );
    }
}

/// Searches for logs that would result in the completion of pending partial notes, ultimately resulting in the notes
/// being delivered to PXE if completed.
///
/// Also terminates completed receptions once their completion block finalizes (the resulting note is then reorg-proof,
/// so there is nothing left to track).
pub(crate) unconstrained fn fetch_and_process_partial_note_completion_logs(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    scope: AztecAddress,
) {
    // Terminate completed receptions whose completion block has finalized.
    PartialNoteReception::load_all(contract_address, scope).for_each(|_i, reception: PartialNoteReception| {
        if reception.is_completed() {
            if reception.completed_origin().unwrap().block_state.is_finalized() {
                reception.terminate();
            }
        }
    });

    // Reload after the terminations above, then process the still-pending receptions.
    let pending_receptions = PartialNoteReception::load_all(contract_address, scope)
        .filter(|reception: PartialNoteReception| !reception.is_completed());
    let pending_partial_notes: EphemeralArray<DeliveredPendingPartialNote> =
        pending_receptions.map(|reception: PartialNoteReception| reception.read_pending());

    aztecnr_debug_log_format!("{} pending partial notes")([pending_partial_notes.len() as Field]);

    // Each of the pending partial notes might get completed by a log containing its public values. For performance
    // reasons, we fetch all of these logs concurrently and then process them one by one, minimizing the amount of time
    // waiting for the node roundtrip.
    let completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);

    // Each entry in the completion logs array corresponds to the entry in the pending partial notes array at the same
    // index. Each inner array contains all matching LogRetrievalResponses.
    assert_eq(completion_logs.len(), pending_receptions.len());

    // `mark_completed` below writes to the fact store rather than mutating these index-aligned arrays, so a forward
    // pass is safe (no index shifting like the previous capsule-array removal required).
    for i in 0..completion_logs.len() {
        let logs_for_tag: EphemeralArray<LogRetrievalResponse> = completion_logs.get(i);
        let pending_partial_note = pending_partial_notes.get(i);
        let reception = pending_receptions.get(i);
        let num_logs = logs_for_tag.len();

        if num_logs == 0 {
            aztecnr_debug_log_format!("Found no completion logs for partial note with tag {}")(
                [pending_partial_note.note_completion_log_tag],
            );

            // Leave the reception pending; we keep searching for this tagged log on future syncs until we find it or
            // its delivery block is reorg'd away (which prunes the reception automatically).
        } else {
            assert(num_logs == 1, f"Expected at most 1 completion log per partial note, got {num_logs}");

            aztecnr_debug_log_format!("Completion log found for partial note with tag {}")([
                pending_partial_note.note_completion_log_tag,
            ]);
            let log = logs_for_tag.get(0);

            // The first field in the completion log payload is the storage slot, followed by the public note
            // content fields.
            let storage_slot = log.log_payload.get(0);
            let public_note_content: BoundedVec<Field, MAX_LOG_CONTENT_LEN - 1> = array::subbvec(log.log_payload, 1);

            // Public fields are assumed to all be placed at the end of the packed representation, so we combine
            // the private and public packed fields (i.e. the contents of the private message and public log
            // plaintext) to get the complete packed content.
            let complete_packed_note = array::append(
                pending_partial_note.packed_private_note_content,
                public_note_content,
            );

            let discovered_notes = attempt_note_nonce_discovery(
                log.unique_note_hashes_in_tx,
                log.first_nullifier_in_tx,
                compute_note_hash,
                compute_note_nullifier,
                contract_address,
                pending_partial_note.owner,
                storage_slot,
                pending_partial_note.randomness,
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

            aztecnr_debug_log_format!("Discovered {0} notes for partial note with tag {1}")([
                discovered_notes.len() as Field,
                pending_partial_note.note_completion_log_tag,
            ]);

            discovered_notes.for_each(|discovered_note| {
                enqueue_note_for_validation(
                    contract_address,
                    pending_partial_note.owner,
                    storage_slot,
                    pending_partial_note.randomness,
                    discovered_note.note_nonce,
                    complete_packed_note,
                    discovered_note.note_hash,
                    discovered_note.inner_nullifier,
                    log.tx_hash,
                );
            });

            // Mark the reception completed, anchored to the completion log's block. The discovered note is itself
            // reorg-handled by the note store; if this block is reorg'd, PXE retracts this fact and the reception
            // folds back to pending, so the completion log is searched for again.
            reception.mark_completed(log.origin_block);
        }
    }
}
