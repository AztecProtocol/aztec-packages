use std::static_assert;

use crate::{
    context::unconstrained_context::UnconstrainedContext,
    oracle::note_discovery::{deliver_note, get_log_by_tag, sync_notes},
    pxe_db::DBArray,
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::{Deserialize, FromField, Serialize, ToField},
};

use crate::oracle::note_discovery::PUBLIC_LOG_SIZE_IN_FIELDS; // todo: move to constants

// We reserve two fields in the note private log that are not part of the note content: one for the storage slot, and
// one for the note type id.
global NOTE_PRIVATE_LOG_RESERVED_FIELDS: u32 = 2;

pub global MAX_NOTE_SERIALIZED_LEN: u32 =
    PRIVATE_LOG_SIZE_IN_FIELDS - NOTE_PRIVATE_LOG_RESERVED_FIELDS;

global PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN: u32 = 1;
global MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN: u32 =
    MAX_NOTE_SERIALIZED_LEN - PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN;

pub struct NoteHashAndNullifier {
    pub note_hash: Field, // The result of NoteInterface::compute_note_hash
    pub inner_nullifier: Field, // The result of NullifiableNote::compute_nullifier_without_context
}

pub unconstrained fn discover_new_notes<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    fetch_and_process_private_logs(contract_address, compute_note_hash_and_nullifier);

    let pending_partial_notes = DBArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_SLOT,
    );

    for i in 0..pending_partial_notes.len() {
        let pending_partial_note: DeliveredPendingPartialNote = pending_partial_notes.get(i);

        let maybe_log = get_log_by_tag(pending_partial_note.note_completion_log_tag);
        if maybe_log.is_some() {
            let log = maybe_log.unwrap();

            let complete_serialized_note_content = array::append(
                pending_partial_note.serialized_private_note_content,
                log.log_content,
            );

            let discovered_notes = attempt_note_nonce_discovery(
                log.unique_note_hashes_in_tx,
                log.first_nullifier_in_tx,
                compute_note_hash_and_nullifier,
                contract_address,
                pending_partial_note.storage_slot,
                pending_partial_note.note_type_id,
                complete_serialized_note_content,
            );

            for_each_in_bounded_vec(
                discovered_notes,
                |discovered_note: DiscoveredNoteInfo, _| {
                    // TODO:(#10728): handle notes that fail delivery
                    assert(
                        deliver_note(
                            contract_address,
                            pending_partial_note.storage_slot,
                            discovered_note.nonce,
                            complete_serialized_note_content,
                            discovered_note.note_hash,
                            discovered_note.inner_nullifier,
                            log.tx_hash,
                            pending_partial_note.recipient,
                        ),
                        "Failed to deliver note",
                    );
                },
            );

            //pending_partial_notes.pop()
        }
        // todo: handle que nunca aparezca el log? podria no ser nunca
    }
}

unconstrained fn fetch_and_process_private_logs<Env>(
    _contract_address: AztecAddress,
    _compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    // We will eventually fetch tagged logs, decrypt and process them here, but for now we simply call the `syncNotes`
    // oracle, which performs tag synchronization, log download, decryption, and then calls the `process_log` function
    // which the decrypted payload, at which point `do_process_log` gets executed and we continue the work ourselves.
    sync_notes();
}

/// Processes a log given its plaintext by trying to find notes encoded in it. This process involves the discovery of
/// the nonce of any such notes, which requires knowledge of the transaction hash in which the notes would've been
/// created, along with the list of unique note hashes in said transaction.
///
/// Additionally, this requires a `compute_note_hash_and_nullifier` lambda that is able to compute these values for any
/// note in the contract given their contents. A typical implementation of such a function would look like this:
///
/// ```
/// |serialized_note_content, note_header, note_type_id| {
///     let hashes = if note_type_id == MyNoteType::get_note_type_id() {
///         assert(serialized_note_content.len() == MY_NOTE_TYPE_SERIALIZATION_LENGTH);
///         dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
///             MyNoteType::deserialize_content,
///             note_header,
///             true,
///             serialized_note_content.storage(),
///         )
///     } else {
///         panic(f"Unknown note type id {note_type_id}")
///     };
///
///     Option::some(dep::aztec::oracle::management::NoteHashesAndNullifier {
///         note_hash: hashes[0],
///         unique_note_hash: hashes[1],
///         inner_nullifier: hashes[3],
///     })
/// }
/// ```
pub unconstrained fn do_process_log<Env>(
    context: UnconstrainedContext,
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    let (storage_slot, note_type_id, log_type_id, log_payload) =
        destructure_log_plaintext(log_plaintext);

    if log_type_id == 0 {
        process_private_note_log(
            context,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            recipient,
            compute_note_hash_and_nullifier,
            storage_slot,
            note_type_id,
            log_payload,
        );
    } else if log_type_id == 1 {
        process_partial_note_private_log(
            context,
            storage_slot,
            note_type_id,
            log_payload,
            recipient,
        );
    } else {
        panic(f"Unknown log type id {log_type_id}");
    }
}

unconstrained fn destructure_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
) -> (Field, Field, Field, BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>) {
    assert(log_plaintext.len() >= NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    // If NOTE_PRIVATE_LOG_RESERVED_FIELDS is changed, causing the assertion below to fail, then the declarations for
    // `storage_slot` and `note_type_id` must be updated as well.
    static_assert(
        NOTE_PRIVATE_LOG_RESERVED_FIELDS == 2,
        "unepxected value for NOTE_PRIVATE_LOG_RESERVED_FIELDS",
    );
    let storage_slot = log_plaintext.get(0);

    // The combined type id is the bit packing of the note type id (which is 7 bits big) and the log type id (which is
    // currently a single bit, and right above it).
    let combined_type_id = log_plaintext.get(1);
    let note_type_id = ((combined_type_id as u64) % 128) as Field;
    let log_type_id = combined_type_id / 128;

    let log_payload = array::subbvec(log_plaintext, NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    (storage_slot, note_type_id, log_type_id, log_payload)
}

unconstrained fn process_private_note_log<Env>(
    context: UnconstrainedContext,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, Field, Field) -> Option<NoteHashAndNullifier>,
    storage_slot: Field,
    note_type_id: Field,
    serialized_note_content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        context.this_address(),
        storage_slot,
        note_type_id,
        serialized_note_content,
    );

    for_each_in_bounded_vec(
        discovered_notes,
        |discovered_note: DiscoveredNoteInfo, _| {
            // TODO:(#10728): handle notes that fail delivery
            assert(
                deliver_note(
                    context.this_address(), // TODO(#10727): allow other contracts to deliver notes
                    storage_slot,
                    discovered_note.nonce,
                    serialized_note_content,
                    discovered_note.note_hash,
                    discovered_note.inner_nullifier,
                    tx_hash,
                    recipient,
                ),
                "Failed to deliver note",
            );
        },
    );
}

struct DiscoveredNoteInfo {
    nonce: Field,
    note_hash: Field,
    inner_nullifier: Field,
}

unconstrained fn attempt_note_nonce_discovery<Env>(
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, Field, Field) -> Option<NoteHashAndNullifier>,
    contract_address: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    serialized_note_content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
) -> BoundedVec<DiscoveredNoteInfo, MAX_NOTE_HASHES_PER_TX> {
    let mut discovered_notes = BoundedVec::new();

    // We need to find the note's nonce, which is the one that results in one of the unique note hashes from tx_hash
    for_each_in_bounded_vec(
        unique_note_hashes_in_tx,
        |expected_unique_note_hash, i| {
            let candidate_nonce = compute_note_hash_nonce(first_nullifier_in_tx, i);

            // TODO(#11157): handle failed note_hash_and_nullifier computation
            let hashes = compute_note_hash_and_nullifier(
                serialized_note_content,
                storage_slot,
                note_type_id,
            )
                .unwrap();

            let siloed_note_hash = compute_siloed_note_hash(contract_address, hashes.note_hash);
            let unique_note_hash = compute_unique_note_hash(candidate_nonce, siloed_note_hash);

            if unique_note_hash == expected_unique_note_hash {
                // Note that we perform no validataions on the nullifier - we fundamentally cannot, since only the
                // application knows how to compute nullifiers, and we simply trust it to have provided the correct one.
                // If it hasn't, then PXE may fail to realize that a given note has been nullified already and end up
                // producing invalid transactions (with duplicate nullifiers).
                discovered_notes.push(
                    DiscoveredNoteInfo {
                        nonce: candidate_nonce,
                        note_hash: hashes.note_hash,
                        inner_nullifier: hashes.inner_nullifier,
                    },
                );
                // We don't exit the loop - it is possible (though rare) for the exact same note content to be present
                // multiple times in the same transaction with different nonces. This typically doesn't happen due to
                // notes containing random values in order to hide their contents.
            }
        },
    );

    discovered_notes
}

struct DeliveredPendingPartialNote {
    note_completion_log_tag: Field,
    storage_slot: Field,
    note_type_id: Field,
    serialized_private_note_content: BoundedVec<Field, MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN>,
    recipient: AztecAddress,
}

// TODO: use `derive(Serialize)`, but we need for generics in struct fields to be handled properly before that happens.
// Currently blocked by Noir's StructDefinition::fields.
impl Serialize<MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 5> for DeliveredPendingPartialNote {
    fn serialize(self) -> [Field; MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 5] {
        [
            self.note_completion_log_tag,
            self.storage_slot,
            self.note_type_id,
            self.serialized_private_note_content.storage()[0],
            self.serialized_private_note_content.storage()[1],
            self.serialized_private_note_content.storage()[2],
            self.serialized_private_note_content.storage()[3],
            self.serialized_private_note_content.storage()[4],
            self.serialized_private_note_content.storage()[5],
            self.serialized_private_note_content.storage()[6],
            self.serialized_private_note_content.storage()[7],
            self.serialized_private_note_content.storage()[8],
            self.serialized_private_note_content.storage()[9],
            self.serialized_private_note_content.storage()[10],
            self.serialized_private_note_content.storage()[12],
            self.serialized_private_note_content.storage()[13],
            self.serialized_private_note_content.storage()[14],
            self.serialized_private_note_content.storage()[15],
            self.serialized_private_note_content.len() as Field,
            self.recipient.to_field(),
        ]
    }
}

impl Deserialize<MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 5> for DeliveredPendingPartialNote {
    fn deserialize(values: [Field; MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN + 5]) -> Self {
        Self {
            note_completion_log_tag: values[0],
            storage_slot: values[1],
            note_type_id: values[2],
            serialized_private_note_content: BoundedVec::from_parts(
                array::subarray(values, 3),
                values[18] as u32,
            ),
            recipient: AztecAddress::from_field(values[19]),
        }
    }
}

global DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_SLOT: Field = 5;

unconstrained fn process_partial_note_private_log(
    context: UnconstrainedContext,
    storage_slot: Field,
    note_type_id: Field,
    log_payload: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    recipient: AztecAddress,
) {
    let pending = DeliveredPendingPartialNote {
        note_completion_log_tag: log_payload.get(0),
        storage_slot,
        note_type_id,
        serialized_private_note_content: array::subbvec(log_payload, 1),
        recipient,
    };

    DBArray::at(
        context.this_address(),
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_SLOT,
    )
        .push(pending);
}

unconstrained fn for_each_in_bounded_vec<T, let MaxLen: u32, Env>(
    vec: BoundedVec<T, MaxLen>,
    f: fn[Env](T, u32) -> (),
) {
    for i in 0..vec.len() {
        f(vec.get_unchecked(i), i);
    }
}
