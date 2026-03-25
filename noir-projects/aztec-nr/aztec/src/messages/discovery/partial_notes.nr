use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::partial_note::{decode_partial_note_private_message, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN},
        processing::{
            enqueue_note_for_validation, get_pending_partial_notes_completion_logs,
            log_retrieval_response::MAX_LOG_CONTENT_LEN,
        },
    },
    utils::array,
};

use crate::logging::{aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}};

/// The slot in the PXE capsules where we store a `CapsuleArray` of `DeliveredPendingPartialNote`.
pub(crate) global DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT: Field = sha256_to_field(
    "AZTEC_NR::DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT".as_bytes(),
);

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
    tx_hash: Field,
    scope: AztecAddress,
) {
    let decoded = decode_partial_note_private_message(msg_metadata, msg_content);

    if decoded.is_some() {
        // We store the information of the partial note we found in a persistent capsule in PXE, so that we can later
        // search for the public log that will complete it.
        let (owner, randomness, note_completion_log_tag, note_type_id, packed_private_note_content) = decoded.unwrap();

        let pending = DeliveredPendingPartialNote {
            owner,
            randomness,
            note_completion_log_tag,
            note_type_id,
            packed_private_note_content,
        };

        CapsuleArray::at(
            contract_address,
            DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
            scope,
        )
            .push(pending);
    } else {
        aztecnr_warn_log_format!(
            "Could not decode partial note private message from tx {0}, ignoring",
        )(
            [tx_hash],
        );
    }
}

/// Searches for logs that would result in the completion of pending partial notes, ultimately resulting in the notes
/// being delivered to PXE if completed.
pub(crate) unconstrained fn fetch_and_process_partial_note_completion_logs(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    scope: AztecAddress,
) {
    let pending_partial_notes = CapsuleArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
        scope,
    );

    aztecnr_debug_log_format!("{} pending partial notes")([pending_partial_notes.len() as Field]);

    // Each of the pending partial notes might get completed by one or more logs containing its public
    // values. For performance reasons, we fetch all of these logs concurrently and then process them one
    // by one, minimizing the amount of time waiting for the node roundtrip.
    let completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes, scope);

    // Each entry in the completion logs array corresponds to the entry in the pending partial notes array at the
    // same index. This means we can use the same index as we iterate through the responses to get both the partial
    // note and the logs that might complete it.

    pending_partial_notes.for_each(|i, pending_partial_note| {
        let logs_for_note = completion_logs.get(i);
        let completion_log_count = logs_for_note.len();

        if completion_log_count == 0 {
            aztecnr_debug_log_format!("Found no completion logs for partial note with tag {}")(
                [pending_partial_note.note_completion_log_tag],
            );

            // Note that we're not removing the pending partial note from the capsule array, so we will continue
            // searching for this tagged log when performing message discovery in the future until we either find it or
            // the entry is somehow removed from the array.
        } else {
            assert(completion_log_count == 1, "Multiple completion logs per partial note tag are not yet supported");

            aztecnr_debug_log_format!("Completion log found for partial note with tag {}")([
                pending_partial_note.note_completion_log_tag,
            ]);

            let log = logs_for_note.get(0);
            // We clear the completion logs as we read them so that the array is empty by the time we next query it.
            // TODO(#14943): use volatile arrays to avoid having to manually clear this.
            logs_for_note.remove(0);

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
                    scope,
                );
            });

            // Because we expect only a single log for a given tag, once we've processed the tagged log then we simply
            // delete the pending work entry, regardless of whether it was actually completed or not.
            pending_partial_notes.remove(i);
        }
    });
}

mod test {
    use crate::{
        capsules::CapsuleArray,
        messages::{
            discovery::partial_notes::{
                DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT, DeliveredPendingPartialNote,
                fetch_and_process_partial_note_completion_logs,
            },
            processing::{compute_per_request_response_slot, log_retrieval_response::LogRetrievalResponse},
        },
        test::helpers::test_environment::TestEnvironment,
    };
    use crate::protocol::{address::AztecAddress, traits::FromField};

    #[test(should_fail_with = "Multiple completion logs per partial note tag are not yet supported")]
    unconstrained fn panics_on_multiple_completion_logs() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let _ = setup_pending_note_with_responses(contract_address, 2);
            let compute_note_hash = |_a, _b, _c, _d, _e, _f| -> Option<Field> { Option::none() };
            let compute_note_nullifier = |_a, _b, _c, _d, _e, _f, _g| -> Option<Field> { Option::none() };

            fetch_and_process_partial_note_completion_logs(
                contract_address,
                compute_note_hash,
                compute_note_nullifier,
                AztecAddress::zero(),
            );
        });
    }

    #[test]
    unconstrained fn keeps_pending_note_when_no_completion_logs() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let pending_notes = setup_pending_note_with_responses(contract_address, 0);
            let compute_note_hash = |_a, _b, _c, _d, _e, _f| -> Option<Field> { Option::none() };
            let compute_note_nullifier = |_a, _b, _c, _d, _e, _f, _g| -> Option<Field> { Option::none() };

            fetch_and_process_partial_note_completion_logs(
                contract_address,
                compute_note_hash,
                compute_note_nullifier,
                AztecAddress::zero(),
            );

            // The pending note should not be removed since there was no completion log to process it.
            assert_eq(pending_notes.len(), 1);
        });
    }

    /// Creates one pending partial note with `response_count` completion logs and mocks the oracle.
    unconstrained fn setup_pending_note_with_responses(
        contract_address: AztecAddress,
        response_count: u32,
    ) -> CapsuleArray<DeliveredPendingPartialNote> {
        let scope = AztecAddress::zero();
        let pending_notes: CapsuleArray<DeliveredPendingPartialNote> = CapsuleArray::at(
            contract_address,
            DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
            scope,
        );
        pending_notes.push(make_dummy_pending_note());

        let response_slot = compute_per_request_response_slot(0);
        let responses: CapsuleArray<LogRetrievalResponse> = CapsuleArray::at(contract_address, response_slot, scope);
        for _ in 0..response_count {
            responses.push(make_dummy_response());
        }

        let _ = std::test::OracleMock::mock("aztec_utl_bulkRetrieveLogs");

        pending_notes
    }

    unconstrained fn make_dummy_pending_note() -> DeliveredPendingPartialNote {
        DeliveredPendingPartialNote {
            owner: AztecAddress::from_field(1),
            randomness: 42,
            note_completion_log_tag: 123,
            note_type_id: 456,
            packed_private_note_content: BoundedVec::new(),
            recipient: AztecAddress::from_field(2),
        }
    }

    unconstrained fn make_dummy_response() -> LogRetrievalResponse {
        LogRetrievalResponse {
            log_payload: BoundedVec::new(),
            tx_hash: 0,
            unique_note_hashes_in_tx: BoundedVec::new(),
            first_nullifier_in_tx: 0,
        }
    }
}
