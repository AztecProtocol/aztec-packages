mod note_log_linked_source_indices;
mod nullifier_index_sorted_tuples;
mod num_active_squashing_hints;
mod squash_flags;

use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use note_log_linked_source_indices::build_note_log_linked_source_indices;
pub(crate) use note_log_linked_source_indices::NoteLogLinkedSourceIndices;
use nullifier_index_sorted_tuples::build_nullifier_index_sorted_tuples;
pub(crate) use num_active_squashing_hints::get_num_active_squashing_hints;
use squash_flags::{build_note_hash_squash_flags, build_nullifier_squash_flags};

use dep::types::{
    abis::{
        note_hash::ScopedNoteHash, nullifier::ScopedNullifier, private_log::PrivateLogData,
        side_effect::scoped::Scoped,
    },
    utils::arrays::{ClaimedLengthArray, SortedTuple},
};

pub struct DerivedHints<let SQUASHING_HINTS_LEN: u32, let NOTE_HASHES_LEN: u32, let NULLIFIERS_LEN: u32, let LOGS_LEN: u32> {
    /// The number of squashing hints that can be used to squash note hashes and nullifiers.
    pub num_active_squashing_hints: u32,
    /// The nullifier indices extracted from the squashing hints, sorted in ascending order.
    pub nullifier_index_sorted_tuples: [SortedTuple<u32>; SQUASHING_HINTS_LEN],
    /// A boolean array indicating which note hashes are to be squashed.
    pub note_hash_squash_flags: [bool; NOTE_HASHES_LEN],
    /// A boolean array indicating which nullifiers are to be squashed.
    pub nullifier_squash_flags: [bool; NULLIFIERS_LEN],
    /// For each note log, identifies the index of its linked note hash, either in the `kept_note_hashes` array, or in
    /// the `transient_data_squashing_hints` array if squashed.
    pub note_log_linked_source_indices: [NoteLogLinkedSourceIndices; LOGS_LEN],
}

/// Constructs all derived hints needed to apply transient data squashing logic.
///
/// Given the same input parameters, this function will deterministically return the same derived hints.
/// Any mismatch in derived hints will cause the verification to fail.
/// An attacker cannot manipulate the hints to bypass the verification process.
pub unconstrained fn build_derived_hints<let NOTE_HASHES_LEN: u32, let NULLIFIERS_LEN: u32, let LOGS_LEN: u32, let SQUASHING_HINTS_LEN: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NOTE_HASHES_LEN>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NULLIFIERS_LEN>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LOGS_LEN>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NOTE_HASHES_LEN>,
    transient_data_squashing_hints: [TransientDataSquashingHint; SQUASHING_HINTS_LEN],
) -> DerivedHints<SQUASHING_HINTS_LEN, NOTE_HASHES_LEN, NULLIFIERS_LEN, LOGS_LEN> {
    let num_active_squashing_hints =
        get_num_active_squashing_hints(transient_data_squashing_hints, nullifiers);

    let nullifier_index_sorted_tuples =
        build_nullifier_index_sorted_tuples(transient_data_squashing_hints);

    let note_hash_squash_flags =
        build_note_hash_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);

    let nullifier_squash_flags =
        build_nullifier_squash_flags(transient_data_squashing_hints, num_active_squashing_hints);

    let note_log_linked_source_indices = build_note_log_linked_source_indices(
        logs,
        note_hashes,
        expected_kept_note_hashes,
        transient_data_squashing_hints,
    );

    DerivedHints {
        num_active_squashing_hints,
        nullifier_index_sorted_tuples,
        note_hash_squash_flags,
        nullifier_squash_flags,
        note_log_linked_source_indices,
    }
}
