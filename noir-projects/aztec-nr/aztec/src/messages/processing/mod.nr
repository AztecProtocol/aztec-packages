pub(crate) mod pending_tagged_log;
pub(crate) mod note_pending_validation;

use crate::{capsules::CapsuleArray, oracle};
use crate::messages::{
    discovery::private_notes::MAX_NOTE_PACKED_LEN,
    processing::{
        note_pending_validation::NotePendingValidation, pending_tagged_log::PendingTaggedLog,
    },
};
use protocol_types::{address::AztecAddress, hash::sha256_to_field};

// Base slot for the pending tagged log array to which the fetch_tagged_logs oracle inserts found private logs.
global PENDING_TAGGED_LOG_ARRAY_BASE_SLOT: Field =
    sha256_to_field("AZTEC_NR::PENDING_TAGGED_LOG_ARRAY_BASE_SLOT".as_bytes());

global NOTE_PENDING_VALIDATION_ARRAY_BASE_SLOT: Field = sha256_to_field(
    "AZTEC_NR::NOTE_PENDING_VALIDATION_ARRAY_BASE_SLOT".as_bytes(),
);

/// Searches for private logs emitted by `contract_address` that might contain messages for one of the local accounts,
/// and stores them in a `CapsuleArray` which is then returned.
pub(crate) unconstrained fn get_private_logs(
    contract_address: AztecAddress,
) -> CapsuleArray<PendingTaggedLog> {
    // We will eventually perform log discovery via tagging here, but for now we simply call the `fetchTaggedLogs`
    // oracle. This makes PXE synchronize tags, download logs and store the pending tagged logs in a capsule array.
    oracle::message_processing::fetch_tagged_logs(PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

    CapsuleArray::at(contract_address, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT)
}

/// Informs PXE of a note's existence so that it can later be retrieved by the `getNotes` oracle. The note will be
/// scoped to `contract_address`, meaning other contracts will not be able to access it unless authorized.
///
/// The packed note is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value
/// is typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are
/// the inner hashes, i.e. the raw hashes returned by `NoteHash::compute_note_hash` and
/// `NoteHash::compute_nullifier`. PXE will verify that the siloed unique note hash was inserted into the tree
/// at `tx_hash`, and will store the nullifier to later check for nullification.
///
/// `recipient` is the account to which the note was sent to. Other accounts will not be able to access this note (e.g.
/// other accounts will not be able to see one another's token balance notes, even in the same PXE) unless authorized.
///
/// Returns true if the note was successfully delivered and added to PXE's database.
pub(crate) unconstrained fn enqueue_note_for_validation(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) {
    CapsuleArray::at(contract_address, NOTE_PENDING_VALIDATION_ARRAY_BASE_SLOT).push(
        NotePendingValidation {
            contract_address,
            storage_slot,
            nonce,
            packed_note,
            note_hash,
            nullifier,
            tx_hash,
            recipient,
        },
    )
}

pub(crate) unconstrained fn validate_enqueued_notes(contract_address: AztecAddress) {
    oracle::message_processing::validate_enqueued_notes(
        contract_address,
        NOTE_PENDING_VALIDATION_ARRAY_BASE_SLOT,
    );
}
