use crate::{
    discovery::{
        ComputeNoteHashAndNullifier,
        nonce_discovery::{attempt_note_nonce_discovery, DiscoveredNoteInfo},
        private_logs::MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN,
    },
    oracle::note_discovery::{deliver_note, get_log_by_tag},
    pxe_db::DBArray,
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    constants::PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
    debug_log::debug_log_format,
    traits::{Deserialize, Serialize, ToField},
};

/// The slot in the PXE DB where we store a `DBArray` of `DeliveredPendingPartialNote`.
// TODO(#11630): come up with some sort of slot allocation scheme.
pub global DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT: Field = 77;

/// Public logs contain an extra field at the beginning with the address of the contract that emitted them, and partial
/// notes emit their completion tag in the log, resulting in the first two fields in the public log not being part of
/// the packed public content.
// TODO(#10273): improve how contract log siloing is handled
pub global NON_PACKED_CONTENT_FIELDS_IN_PUBLIC_LOG: u32 = 2;

/// The maximum length of the packed representation of public fields in a partial note. This is limited by public log
/// size and extra fields in the log (e.g. the tag).
pub global MAX_PUBLIC_PARTIAL_NOTE_PACKED_CONTENT_LENGTH: u32 =
    PUBLIC_LOG_DATA_SIZE_IN_FIELDS - NON_PACKED_CONTENT_FIELDS_IN_PUBLIC_LOG;

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

/// Searches for public logs that would result in the completion of pending partial notes, ultimately resulting in the
/// notes being delivered to PXE if completed.
pub unconstrained fn fetch_and_process_public_partial_note_completion_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    let pending_partial_notes = DBArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT,
    );

    debug_log_format(
        "{} pending partial notes",
        [pending_partial_notes.len() as Field],
    );

    let mut i = &mut 0;
    whyle(
        || *i < pending_partial_notes.len(),
        || {
            let pending_partial_note: DeliveredPendingPartialNote = pending_partial_notes.get(*i);

            let maybe_log = get_log_by_tag(pending_partial_note.note_completion_log_tag);
            if maybe_log.is_none() {
                debug_log_format(
                    "Found no completion logs for partial note #{}",
                    [(*i) as Field],
                );
                *i += 1 as u32;
                // Note that we're not removing the pending partial note from the PXE DB, so we will continue searching
                // for this tagged log when performing note discovery in the future until we either find it or the entry
                // is somehow removed from the PXE DB.
            } else {
                debug_log_format("Completion log found for partial note #{}", [(*i) as Field]);
                let log = maybe_log.unwrap();

                // Public logs have an extra field at the beginning with the contract address, which we use to verify
                // that we're getting the logs from the expected contract.
                // TODO(#10273): improve how contract log siloing is handled
                assert_eq(
                    log.log_content.get(0),
                    contract_address.to_field(),
                    "Got a public log emitted by a different contract",
                );

                // Public fields are assumed to all be placed at the end of the packed representation, so we combine the
                // private and public packed fields (i.e. the contents of the log sans the extra fields) to get the
                // complete packed content.
                let packed_public_note_content: BoundedVec<_, MAX_PUBLIC_PARTIAL_NOTE_PACKED_CONTENT_LENGTH> =
                    array::subbvec(log.log_content, NON_PACKED_CONTENT_FIELDS_IN_PUBLIC_LOG);
                let complete_packed_note_content = array::append(
                    pending_partial_note.packed_private_note_content,
                    packed_public_note_content,
                );

                let discovered_notes = attempt_note_nonce_discovery(
                    log.unique_note_hashes_in_tx,
                    log.first_nullifier_in_tx,
                    compute_note_hash_and_nullifier,
                    contract_address,
                    pending_partial_note.storage_slot,
                    pending_partial_note.note_type_id,
                    complete_packed_note_content,
                );

                debug_log_format(
                    "Discovered {0} notes for partial note {1}",
                    [discovered_notes.len() as Field, (*i) as Field],
                );

                array::for_each_in_bounded_vec(
                    discovered_notes,
                    |discovered_note: DiscoveredNoteInfo, _| {
                        // TODO:(#10728): decide how to handle notes that fail delivery. This could be due to e.g. a
                        // temporary node connectivity issue - is simply throwing good enough here?
                        assert(
                            deliver_note(
                                contract_address,
                                pending_partial_note.storage_slot,
                                discovered_note.nonce,
                                complete_packed_note_content,
                                discovered_note.note_hash,
                                discovered_note.inner_nullifier,
                                log.tx_hash,
                                pending_partial_note.recipient,
                            ),
                            "Failed to deliver note",
                        );
                    },
                );

                // Because there is only a single log for a given tag, once we've processed the tagged log then we
                // simply delete the pending work entry, regardless of whether it was actually completed or not.
                // TODO(#11627): only remove the pending entry if we actually process a log that results in the note
                // being completed.
                pending_partial_notes.remove(*i);
            }
        },
    );
}

/// Custom version of a while loop, calls `body` repeatedly until `condition` returns false. To be removed once Noir
/// supports looping in unconstrained code.
fn whyle<Env, Env2>(condition: fn[Env]() -> bool, body: fn[Env2]() -> ()) {
    if condition() {
        body();
        whyle(condition, body);
    }
}
