use crate::reset::transient_data::{
    derived_hints::get_num_active_squashing_hints,
    transient_data_squashing_hint::TransientDataSquashingHint,
};
use ::types::{
    abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::PrivateLogData},
    side_effect::{Counted, Ordered, Scoped},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

/// Splice-removes squashable elements from the `note_hashes`, `nullifiers`, and `logs` arrays.
///
/// In some cases, a note is nullified in the same tx in which it was created, by some other
/// function in the tx.
/// When this happens, we can safely squash (i.e., remove) the note hash, its corresponding nullifier, and its log(s).
///
/// @param `transient_data_squashing_hints` - a list of hints specifying the indices of (note_hash, nullifier) pairs that
///        can be squashed. The indices relate to the previous kernel's `note_hashes` and `nullifier` arrays, respectively.
/// All logs which are unrelated to any notes are retained. A note log is retained **only** if it's linked to a note_hash that is not squashed.
///
/// @returns Updated `note_hashes`, `nullifiers`, and `logs` arrays with the squashable elements splice-removed.
///          That is, if an item is removed from the middle, all elements to the right of it are shifted left by one.
pub unconstrained fn squash_transient_data<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let TransientDataSquashingHintsLen: u32>(
    previous_kernel_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
    previous_kernel_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>,
    previous_kernel_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
    transient_data_squashing_hints: [TransientDataSquashingHint; TransientDataSquashingHintsLen],
    ) -> (ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>, ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>, ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>) {
    //
    // E.g.
    // transient_data_squashing_hints: [(0, 2), (1, 6), (3, 3), (8, 8)] <-- so num_active_squashing_hints = 3.
    //                                   ^  ^                    ^  ^
    //                        note_index_|  |_nullifier_index    Nullish values (illustrative prev kernel array lengths of 8)
    //                                                           All hint indices after this are ignored.
    // Those hints correspond to these relationships:
    //
    // prev_ker_nullifiers:     [ n0,  n1,  n2,  n3,  n4,  n5,  n6 | 0]
    //                                       x    x              x
    //                              _________|    |              |
    //                             |              |              |
    //                             |    |---------)--------------
    // prev_ker_note_hashes:       x    x         x
    //     - note_hash:         [nh0, nh1, nh2, nh3, nh4, nh5 |  0,   0]
    //     - counter:           [ c0,  c1,  c2,  c3,  c4,  c5 |  0,   0]
    //                                       ^    x         ^
    //                              _________|    |         |
    //                             |     _________|         |
    //                             |    |    |              |
    // prev_ker_logs:              v    x    x              v
    //     - note_hash_counter: [ c2,  c3,  c3,   0,   0,  c5,   0,   0] (illustrative relationships)
    //     - log:               [ l0,  l1,  l2,  l3,  l4,  l5,  l6,  l7]
    //
    // nullifier_squash_flags:  [  0,   0,   1,   1,   0,   0,   1,   0]
    // note_hash_squash_flags:  [  1,   1,   0,   1,   0,   0,   0,   0]
    //
    // kept_nullifiers:         [ n0,  n1,  n4,  n5 |  0,   0,   0,   0]
    //
    // kept_note_hashes:
    //     - note_hash:         [nh2, nh4, nh5 |  0,   0,   0,   0,   0]
    //     - counter:           [ c2,  c4,  c5 |  0,   0,   0,   0,   0]
    //
    // kept_logs:
    //     - note_hash_counter: [ c2,   0,   0,  c5,   0,   0 |  0  0]
    //     - log:               [ l0,  l3,  l4,  l5,  l6,  l7 |  0  0]
    //

    // Create a flag for each note_hash and nullifier, indicating whether it is squashed.
    let mut note_hash_squash_flags = [false; NoteHashesLen];
    let mut nullifier_squash_flags = [false; NullifiersLen];

    let num_active_squashing_hints =
        get_num_active_squashing_hints(transient_data_squashing_hints, previous_kernel_nullifiers);
    for i in 0..num_active_squashing_hints {
        let hint = transient_data_squashing_hints[i];
        note_hash_squash_flags[hint.note_hash_index] = true;
        nullifier_squash_flags[hint.nullifier_index] = true;
    }

    // Propagate note hashes that are not squashed:
    let mut kept_note_hashes = ClaimedLengthArray::empty();
    for i in 0..previous_kernel_note_hashes.length {
        if !note_hash_squash_flags[i] {
            kept_note_hashes.push(previous_kernel_note_hashes.array[i]);
        }
    }

    // Propagate nullifiers that are not squashed:
    let mut kept_nullifiers = ClaimedLengthArray::empty();
    for i in 0..previous_kernel_nullifiers.length {
        if !nullifier_squash_flags[i] {
            kept_nullifiers.push(previous_kernel_nullifiers.array[i]);
        }
    }

    let mut kept_logs = ClaimedLengthArray::empty();
    for i in 0..previous_kernel_logs.length {
        let log = previous_kernel_logs.array[i];
        let note_hash_counter = log.innermost().note_hash_counter;
        if note_hash_counter == 0 {
            // The log is not associated with any note hash.
            kept_logs.push(log);
        } else {
            // Keep the log if it's linked to a note hash in the kept_note_hashes array.
            //
            // Note: Every note log must be linked to either a kept or squashed note hash (see implementation in
            // `validate_log_squashing.nr`). If a log were allowed to link to a non-existent note hash, we would need to
            // keep such logs too. But since that cannot happen, this check is sufficient.
            let is_linked_to_kept_note_hash =
                kept_note_hashes.array.any(|n| (n.counter() == note_hash_counter));
            if is_linked_to_kept_note_hash {
                kept_logs.push(log);
            }
        }
    }

    (kept_note_hashes, kept_nullifiers, kept_logs)
}

mod tests {
    use crate::reset::transient_data::tests::{mock_log, TransientDataFixtureBuilder};
    use super::squash_transient_data;
    use ::types::{
        abis::{nullifier::Nullifier, private_log::PrivateLogData},
        side_effect::Counted,
        tests::utils::assert_array_eq,
    };

    #[test]
    unconstrained fn squash_transient_data_squash_some() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            Counted::new(11, 1),
            Counted::new(22, 2),
            Counted::new(33, 3),
            Counted::new(44, 4),
            Counted::new(55, 5),
        ]);

        builder.add_nullifiers([
            Nullifier { value: 66, note_hash: 0 }.count(6),
            Nullifier { value: 77, note_hash: 11 }.count(7), // Nullify note_hashes[0]
            Nullifier { value: 88, note_hash: 101 }.count(8),
            Nullifier { value: 99, note_hash: 44 }.count(9), // Nullify note_hashes[3]
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(9), // Linked to note_hashes[0]
            PrivateLogData { log: mock_log(202), note_hash_counter: 4 }.count(10), // Linked to note_hashes[3]
            PrivateLogData { log: mock_log(303), note_hash_counter: 2 }.count(11),
            PrivateLogData { log: mock_log(404), note_hash_counter: 0 }.count(12),
            PrivateLogData { log: mock_log(505), note_hash_counter: 1 }.count(13), // Linked to note_hashes[0]
        ]);

        builder.add_squashing_hint(0, 1); // Squash note_hashes[0] with nullifier[1]
        builder.add_squashing_hint(3, 3); // Squash note_hashes[3] with nullifier[3]

        let (kept_note_hashes, kept_nullifiers, kept_logs) = squash_transient_data(
            builder.note_hashes,
            builder.nullifiers,
            builder.logs,
            builder.transient_data_squashing_hints,
        );

        // Note hashes 0, 3, nullifiers 1, 3, and logs 0, 1, 4 are squashed.
        let note_hashes = builder.note_hashes.array;
        assert_eq(kept_note_hashes.length, 3);
        assert_array_eq(
            kept_note_hashes.array,
            [note_hashes[1], note_hashes[2], note_hashes[4]],
        );

        let nullifiers = builder.nullifiers.array;
        assert_eq(kept_nullifiers.length, 2);
        assert_array_eq(kept_nullifiers.array, [nullifiers[0], nullifiers[2]]);

        let logs = builder.logs.array;
        assert_eq(kept_logs.length, 2);
        assert_array_eq(kept_logs.array, [logs[2], logs[3]]);
    }
}
