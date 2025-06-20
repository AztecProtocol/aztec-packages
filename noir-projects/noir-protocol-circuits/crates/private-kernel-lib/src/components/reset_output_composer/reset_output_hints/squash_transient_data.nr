use dep::reset_kernel_lib::TransientDataIndexHint;
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// Splice-removes transient elements from the note_hashes, nullifiers, and logs arrays.
///
/// Sometimes a note will be nullified in the same tx in which it was created.
/// We can then squash the note_hash, its log, and its nullifier from their respective arrays.
///
/// @param transient_data_index_hints - tells us the indices of each transient note_hash
/// (in the note_hashes array), and the index of each corresponding nullifier (in the nullifiers array).
///
/// @returns versions of the note_hash, nullifiers, logs arrays, but with the transient data splice-removed.
pub unconstrained fn squash_transient_data<let M: u32, let N: u32, let P: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, M>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, N>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, P>,
    transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
    ) -> (ClaimedLengthArray<ScopedNoteHash, M>, ClaimedLengthArray<ScopedNullifier, N>, ClaimedLengthArray<Scoped<PrivateLogData>, P>) {
    // E.g.
    // note_hashes: [   C0, C1,    C2, C3, C4, C5, C6, C7]
    // nullifiers:  [N(C5),  N, N(C3),  N,  N,  _,  _,  _] <-- Notes C5 and C3 are transient notes.
    //
    // transient_nullifier_index_for_each_note_hash:
    //              [    _,   _,    _,  2,  _,  0,  _,  _] <-- the index of the transient nullifier for each note
    // transient_note_hash_index_for_each_nullifier:
    //              [    5,   _,    3,  _,  _,  _,  _,  _] <-- the index of the transient note for each nullifier
    //
    // Outputs:
    // propagated_note_hashes: [ C0, C1, C2, C4, C6, C7, _, _]
    // propagated_nullifiers:  [  N,  N,  N,  _,  _,  _, _, _]

    // TODO: Consider using Option<u32> instead of using N or M to mean "none":
    let mut transient_nullifier_index_for_each_note_hash = [N; M];
    let mut transient_note_hash_index_for_each_nullifier = [M; N];
    for i in 0..transient_data_index_hints.len() {
        let hint = transient_data_index_hints[i];
        if hint.note_hash_index != M {
            transient_nullifier_index_for_each_note_hash[hint.note_hash_index] =
                hint.nullifier_index;
            transient_note_hash_index_for_each_nullifier[hint.nullifier_index] =
                hint.note_hash_index;
        }
    }

    // Only propagate non-transient note_hashes:
    let mut propagated_note_hashes: ClaimedLengthArray<ScopedNoteHash, M> =
        ClaimedLengthArray::empty();
    for i in 0..note_hashes.array.len() {
        if transient_nullifier_index_for_each_note_hash[i] == N {
            // N meaning "null", meaning "not transient"
            let note_hash = note_hashes.array[i];
            if !note_hash.is_empty() {
                propagated_note_hashes.push(note_hashes.array[i]);
            }
        }
    }

    // Only propagate non-transient nullifiers:
    let mut propagated_nullifiers: ClaimedLengthArray<ScopedNullifier, N> =
        ClaimedLengthArray::empty();
    for i in 0..nullifiers.array.len() {
        if transient_note_hash_index_for_each_nullifier[i] == M {
            // M meaning "null", meaning "not transient"
            let nullifier = nullifiers.array[i];
            if !nullifier.is_empty() {
                propagated_nullifiers.push(nullifiers.array[i]);
            }
        }
    }

    let mut propagated_logs: ClaimedLengthArray<Scoped<PrivateLogData>, P> =
        ClaimedLengthArray::empty();
    for i in 0..logs.array.len() {
        let log = logs.array[i];
        if log.inner.note_hash_counter == 0 {
            // The log is not associated with any note.
            if !log.is_empty() {
                propagated_logs.push(log);
            }
        } else {
            // The log _is_ associated with a note.
            // E.g. The log is delivering the contents of a note.
            let linked_note_hash_propagated = propagated_note_hashes.array.any(
                |n: ScopedNoteHash| (n.counter() == log.inner.note_hash_counter),
            );
            if linked_note_hash_propagated {
                if !log.is_empty() {
                    propagated_logs.push(log);
                }
            }
        }
    }

    let l = propagated_note_hashes.length;

    (propagated_note_hashes, propagated_nullifiers, propagated_logs)
}
