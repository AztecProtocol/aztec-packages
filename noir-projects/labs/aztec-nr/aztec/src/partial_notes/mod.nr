mod fsm;

use crate::{
    facts::OriginBlock,
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::partial_note::{decode_partial_note_private_message, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN},
        processing::{get_pending_partial_notes_completion_logs, ResolvedTx},
    },
};

use crate::logging::{aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};
use fsm::PartialNoteFsm;

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
    recipient: AztecAddress,
) {
    let decoded = decode_partial_note_private_message(msg_metadata, msg_content);

    if decoded.is_some() {
        let (owner, randomness, note_completion_log_tag, note_type_id, packed_private_note_content) = decoded.unwrap();

        PartialNoteFsm::init(
            contract_address,
            recipient,
            DeliveredPendingPartialNote {
                owner,
                randomness,
                note_completion_log_tag,
                note_type_id,
                packed_private_note_content,
            },
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

/// Drives every active partial-note FSM forward.
pub(crate) unconstrained fn sync(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    scope: AztecAddress,
) {
    // `load_all` is a relatively expensive oracle round-trip, so we call it once and reuse the result.
    let active_partial_note_fsms = PartialNoteFsm::load_all(contract_address, scope);

    // Fetching completion logs is the dominant cost of partial note contract sync (a node round-trip each) and only
    // pending notes need them, so we batch that fetch for the pending subset and then drive the FSMs in two passes:
    //  1. Step each pending FSM with its freshly-fetched completion logs, giving found logs a chance to complete notes.
    //  2. Step every active FSM with no logs, which is where completed-and-finalized FSMs terminate.
    // Keeping both the completion and termination logic inside `PartialNoteFsm::step` is what lets the orchestrator
    // stay this small, the price is the somewhat less elegant two-pass shape that the batched fetch forces on us.
    let pending_partial_note_fsms = active_partial_note_fsms.filter(|fsm: PartialNoteFsm| fsm.is_pending());
    let pending_partial_notes = pending_partial_note_fsms.map(|fsm: PartialNoteFsm| fsm.read_pending_partial_note());

    aztecnr_debug_log_format!("{} pending partial notes")([pending_partial_notes.len() as Field]);

    let completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);
    assert_eq(completion_logs.len(), pending_partial_notes.len());

    pending_partial_note_fsms.for_each(|i, fsm: PartialNoteFsm| {
        fsm.step(Option::some(completion_logs.get(i)), compute_note_hash, compute_note_nullifier);
    });

    active_partial_note_fsms.for_each(|_i, fsm: PartialNoteFsm| {
        fsm.step(Option::none(), compute_note_hash, compute_note_nullifier);
    });
}
