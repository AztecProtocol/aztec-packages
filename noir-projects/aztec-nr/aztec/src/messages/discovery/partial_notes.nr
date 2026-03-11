use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::{ComputeNoteHashAndNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::partial_note::{decode_partial_note_private_message, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN},
        processing::{
            enqueue_note_for_validation,
            get_pending_partial_notes_completion_logs,
            log_retrieval_response::{LogRetrievalResponse, MAX_LOG_CONTENT_LEN},
        },
    },
    utils::array,
};

use crate::logging::{aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::messages::logs::note::MAX_NOTE_PACKED_LEN;
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
    pub(crate) recipient: AztecAddress,
}

pub(crate) unconstrained fn process_partial_note_private_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
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
            recipient,
        };

        CapsuleArray::at(
            contract_address,
            DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
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
pub(crate) unconstrained fn fetch_and_process_partial_note_completion_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    let pending_partial_notes = CapsuleArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
    );

    aztecnr_debug_log_format!("{} pending partial notes")([pending_partial_notes.len() as Field]);

    // Each of the pending partial notes might get completed by a log containing its public values. For performance
    // reasons, we fetch all of these logs concurrently and then process them one by one, minimizing the amount of time
    // waiting for the node roundtrip.
    let maybe_completion_logs = get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes);

    // Each entry in the maybe completion logs array corresponds to the entry in the pending partial notes array at the
    // same index. This means we can use the same index as we iterate through the responses to get both the partial
    // note and the log that might complete it.
    assert_eq(maybe_completion_logs.len(), pending_partial_notes.len());

    maybe_completion_logs.for_each(|i, maybe_log: Option<LogRetrievalResponse>| {
        // We clear the completion logs as we read them so that the array is empty by the time we next query it.
        // TODO(#14943): use volatile arrays to avoid having to manually clear this.
        maybe_completion_logs.remove(i);

        let pending_partial_note = pending_partial_notes.get(i);

        if maybe_log.is_none() {
            aztecnr_debug_log_format!("Found no completion logs for partial note with tag {}")(
                [pending_partial_note.note_completion_log_tag],
            );

            // Note that we're not removing the pending partial note from the capsule array, so we will
            // continue searching for this tagged log when performing message discovery in the future
            // until we either find it or the entry is somehow removed from the array.
        } else {
            aztecnr_debug_log_format!("Completion log found for partial note with tag {}")([
                pending_partial_note.note_completion_log_tag,
            ]);
            process_completion_log(
                contract_address,
                pending_partial_note,
                maybe_log.unwrap(),
                compute_note_hash_and_nullifier,
            );

            // We delete the pending work entry regardless of whether processing resulted in a note
            // being enqueued: completion logs are tied to a specific tx, so if the note hash wasn't found
            // in that tx's unique note hashes it won't appear on a future retry either.
            pending_partial_notes.remove(i);
        }
    });
}

/// Ensures only well-formed completion logs proceed to note discovery, discarding payloads that are empty or
/// exceed the maximum packed note length.
unconstrained fn process_completion_log<Env>(
    contract_address: AztecAddress,
    pending_partial_note: DeliveredPendingPartialNote,
    log: LogRetrievalResponse,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    if log.log_payload.len() > 0 {
        // Payload is [storage_slot, ...public_note_content], so public length is payload - 1.
        let private_len = pending_partial_note.packed_private_note_content.len();
        let public_len: u32 = log.log_payload.len() - 1;
        if private_len + public_len <= MAX_NOTE_PACKED_LEN {
            discover_and_enqueue_partial_note(
                contract_address,
                pending_partial_note,
                log,
                compute_note_hash_and_nullifier,
            );
        } else {
            aztecnr_warn_log_format!(
                "Partial note (private={0}, public={1}, max={2}) for tag {3} exceeds max length, discarding",
            )(
                [
                    private_len as Field,
                    public_len as Field,
                    MAX_NOTE_PACKED_LEN as Field,
                    pending_partial_note.note_completion_log_tag,
                ],
            );
        }
    } else {
        aztecnr_warn_log_format!(
            "Empty completion log for partial note with tag {0}, discarding",
        )(
            [pending_partial_note.note_completion_log_tag],
        );
    }
}

/// Reconstructs the complete packed note from its private and public components, discovers its on-chain
/// nonce via note hash matching, and enqueues it for validation so that the note becomes queryable.
unconstrained fn discover_and_enqueue_partial_note<Env>(
    contract_address: AztecAddress,
    pending_partial_note: DeliveredPendingPartialNote,
    log: LogRetrievalResponse,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // The first field in the completion log payload is the storage slot, followed by the public
    // note content fields.
    let storage_slot = log.log_payload.get(0);
    let public_note_content: BoundedVec<Field, MAX_LOG_CONTENT_LEN - 1> = array::subbvec(log.log_payload, 1);

    let complete_packed_note = array::append(
        pending_partial_note.packed_private_note_content,
        public_note_content,
    );

    let discovered_notes = attempt_note_nonce_discovery(
        log.unique_note_hashes_in_tx,
        log.first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        pending_partial_note.owner,
        storage_slot,
        pending_partial_note.randomness,
        pending_partial_note.note_type_id,
        complete_packed_note,
    );

    if discovered_notes.len() > 0 {
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
                pending_partial_note.recipient,
            );
        });
    } else {
        aztecnr_warn_log_format!(
            "Completion log for partial note with tag {0} did not result in any notes being found, discarding",
        )(
            [pending_partial_note.note_completion_log_tag],
        );
    }
}

mod test {
    use crate::capsules::CapsuleArray;
    use crate::messages::{
        discovery::NoteHashAndNullifier,
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{
            log_retrieval_response::{LogRetrievalResponse, MAX_LOG_CONTENT_LEN},
            NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT,
        },
    };
    use crate::note::{
        HintedNote,
        note_interface::{NoteHash, NoteType},
        note_metadata::SettledNoteMetadata,
        utils::compute_note_hash_for_nullification,
    };
    use crate::oracle::random::random;
    use crate::protocol::{
        address::AztecAddress,
        hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
        traits::{FromField, Packable},
    };
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::test::mocks::mock_note::MockNote;
    use crate::utils::array;

    use super::{DeliveredPendingPartialNote, process_completion_log};

    #[test]
    unconstrained fn discards_empty_completion_payload() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();

            let log = LogRetrievalResponse {
                log_payload: BoundedVec::new(), // Empty payload
                tx_hash: random(),
                unique_note_hashes_in_tx: BoundedVec::new(),
                first_nullifier_in_tx: random(),
            };

            process_completion_log(
                contract_address,
                make_pending_partial_note(
                    AztecAddress::from_field(random()),
                    random(),
                    AztecAddress::from_field(random()),
                ),
                log,
                compute_note_hash_and_nullifier,
            );
            assert_eq(note_validation_requests_len(contract_address), 0);
        });
    }

    #[test]
    unconstrained fn discards_oversized_completion_payload() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();

            let mut log_payload: BoundedVec<Field, MAX_LOG_CONTENT_LEN> = BoundedVec::new();
            // +1 for the storage slot field (stripped before length check), +1 to exceed MAX_NOTE_PACKED_LEN
            for _ in 0..(MAX_NOTE_PACKED_LEN + 2) {
                log_payload.push(0);
            }

            let log = LogRetrievalResponse {
                log_payload,
                tx_hash: random(),
                unique_note_hashes_in_tx: BoundedVec::new(),
                first_nullifier_in_tx: random(),
            };

            process_completion_log(
                contract_address,
                make_pending_partial_note(
                    AztecAddress::from_field(random()),
                    random(),
                    AztecAddress::from_field(random()),
                ),
                log,
                compute_note_hash_and_nullifier,
            );
            assert_eq(note_validation_requests_len(contract_address), 0);
        });
    }

    #[test]
    unconstrained fn discards_on_no_matching_note_hash() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();

            let log = LogRetrievalResponse {
                log_payload: BoundedVec::from_array([random(), random()]),
                tx_hash: random(),
                unique_note_hashes_in_tx: BoundedVec::from_array([random(), random(), random()]),
                first_nullifier_in_tx: random(),
            };

            process_completion_log(
                contract_address,
                make_pending_partial_note(
                    AztecAddress::from_field(random()),
                    random(),
                    AztecAddress::from_field(random()),
                ),
                log,
                compute_note_hash_and_nullifier,
            );
            assert_eq(note_validation_requests_len(contract_address), 0);
        });
    }

    #[test]
    unconstrained fn enqueues_notes_on_valid_completion_log() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let owner = AztecAddress::from_field(random());
            let randomness = random();
            let storage_slot = random();
            let note_value = random();
            let first_nullifier = random();

            let note = MockNote { value: note_value };
            let note_nonce = compute_note_hash_nonce(first_nullifier, 0);
            let note_hash = note.compute_note_hash(owner, storage_slot, randomness);
            let unique_note_hash = compute_unique_note_hash(
                note_nonce,
                compute_siloed_note_hash(contract_address, note_hash),
            );

            let pending = make_pending_partial_note(owner, randomness, AztecAddress::from_field(random()));

            let log = LogRetrievalResponse {
                log_payload: BoundedVec::from_array([storage_slot, note_value]),
                tx_hash: random(),
                unique_note_hashes_in_tx: BoundedVec::from_array([unique_note_hash]),
                first_nullifier_in_tx: first_nullifier,
            };

            process_completion_log(
                contract_address,
                pending,
                log,
                compute_note_hash_and_nullifier,
            );
            assert_eq(note_validation_requests_len(contract_address), 1);
        });
    }

    unconstrained fn compute_note_hash_and_nullifier(
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        storage_slot: Field,
        note_type_id: Field,
        contract_address: AztecAddress,
        randomness: Field,
        note_nonce: Field,
    ) -> Option<NoteHashAndNullifier> {
        if note_type_id == MockNote::get_id() {
            let note = MockNote::unpack(array::subarray(packed_note.storage(), 0));
            let note_hash = note.compute_note_hash(owner, storage_slot, randomness);

            let note_hash_for_nullification = compute_note_hash_for_nullification(
                HintedNote {
                    note,
                    contract_address,
                    owner,
                    randomness,
                    storage_slot,
                    metadata: SettledNoteMetadata::new(note_nonce).into(),
                },
            );

            let inner_nullifier = note.compute_nullifier_unconstrained(owner, note_hash_for_nullification);
            Option::some(NoteHashAndNullifier { note_hash, inner_nullifier })
        } else {
            Option::none()
        }
    }

    fn make_pending_partial_note(
        owner: AztecAddress,
        randomness: Field,
        recipient: AztecAddress,
    ) -> DeliveredPendingPartialNote {
        DeliveredPendingPartialNote {
            owner,
            randomness,
            note_completion_log_tag: random(),
            note_type_id: MockNote::get_id(),
            packed_private_note_content: BoundedVec::new(),
            recipient,
        }
    }

    unconstrained fn note_validation_requests_len(contract_address: AztecAddress) -> u32 {
        CapsuleArray::<Field>::at(contract_address, NOTE_VALIDATION_REQUESTS_ARRAY_BASE_SLOT).len()
    }
}
