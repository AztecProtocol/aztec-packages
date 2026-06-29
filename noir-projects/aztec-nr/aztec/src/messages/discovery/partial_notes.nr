use crate::{
    ephemeral::EphemeralArray,
    facts::OriginBlock,
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, partial_note_reception::PartialNoteReception},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::partial_note::{decode_partial_note_private_message, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN},
        processing::{
            get_pending_partial_notes_completion_logs, log_retrieval_response::LogRetrievalResponse, ResolvedTx,
        },
    },
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

/// Drives all pending partial-note receptions one sync step forward, delegating per-reception work to
/// [`PartialNoteReception`]. Its only responsibilities are loading the receptions, batch-fetching completion logs for
/// the pending ones, and delegating individual processing:
///
/// 1. terminate completed receptions whose completion block has finalized;
/// 2. fetch the completion logs of all still-pending receptions in a single concurrent round-trip;
/// 3. hand each pending reception its completion log (if found) to complete itself.
pub(crate) unconstrained fn fetch_and_process_partial_note_completion_logs(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    scope: AztecAddress,
) {
    PartialNoteReception::load_all(contract_address, scope).for_each(|_i, reception: PartialNoteReception| {
        reception.terminate_if_finalized();
    });

    // Reload after the terminations above, then batch-fetch the completion logs of the still-pending receptions. For
    // performance we fetch all of these logs concurrently, minimizing the time spent waiting for node roundtrips.
    let pending_receptions = PartialNoteReception::load_all(contract_address, scope)
        .filter(|reception: PartialNoteReception| !reception.is_completed());
    let pending_partial_notes: EphemeralArray<DeliveredPendingPartialNote> =
        pending_receptions.map(|reception: PartialNoteReception| reception.read_pending());

    aztecnr_debug_log_format!("{} pending partial notes")([pending_partial_notes.len() as Field]);

    let completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);

    // Each completion-logs entry is index-aligned with the pending receptions, and each inner array holds all matching
    // `LogRetrievalResponse`s for that reception's tag.
    assert_eq(completion_logs.len(), pending_receptions.len());

    for i in 0..completion_logs.len() {
        let logs_for_tag: EphemeralArray<LogRetrievalResponse> = completion_logs.get(i);
        let num_logs = logs_for_tag.len();

        if num_logs == 0 {
            // Leave the reception pending; we keep searching for its completion log on future syncs until we find it
            // or its delivery block is reorg'd away (which prunes the reception automatically).
        } else {
            assert(num_logs == 1, f"Expected at most 1 completion log per partial note, got {num_logs}");
            pending_receptions.get(i).complete_with_log(logs_for_tag.get(0), compute_note_hash, compute_note_nullifier);
        }
    }
}
