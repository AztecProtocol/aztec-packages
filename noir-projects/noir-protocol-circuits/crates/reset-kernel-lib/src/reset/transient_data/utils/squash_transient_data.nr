use crate::reset::transient_data::{
    derived_hints::get_num_active_squashing_hints,
    transient_data_squashing_hint::TransientDataSquashingHint,
};
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

/// Splice-removes squashable elements from the `note_hashes`, `nullifiers`, and `logs` arrays.
///
/// In some cases, a note is nullified in the same transaction where it was created.
/// When this happens, we can safely squash (i.e., remove) the note hash, its corresponding nullifier, and its log(s).
///
/// @param `transient_data_squashing_hints` - a list of hints specifying which note hash and nullifier pairs can be
/// squashed. Each hint contains an index into `note_hashes` and the corresponding index into `nullifiers`.
///
/// All non-note logs are retained. A note log is retained **only** if it's linked to a note hash that is not squashed.
///
/// @returns Updated `note_hashes`, `nullifiers`, and `logs` arrays with the squashable elements removed.
pub unconstrained fn squash_transient_data<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    ) -> (ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>, ClaimedLengthArray<ScopedNullifier, NullifiersLen>, ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>) {
    // Create a flag for each note hash and nullifier, indicating whether it is squashed.
    let mut note_hash_squash_flags = [false; NoteHashesLen];
    let mut nullifier_squash_flags = [false; NullifiersLen];
    let num_active_squashing_hints =
        get_num_active_squashing_hints(transient_data_squashing_hints, nullifiers);
    for i in 0..num_active_squashing_hints {
        let hint = transient_data_squashing_hints[i];
        note_hash_squash_flags[hint.note_hash_index] = true;
        nullifier_squash_flags[hint.nullifier_index] = true;
    }

    // Propagate note hashes that are not squashed:
    let mut kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen> =
        ClaimedLengthArray::empty();
    for i in 0..note_hashes.length {
        if !note_hash_squash_flags[i] {
            kept_note_hashes.push(note_hashes.array[i]);
        }
    }

    // Propagate nullifiers that are not squashed:
    let mut kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen> =
        ClaimedLengthArray::empty();
    for i in 0..nullifiers.length {
        if !nullifier_squash_flags[i] {
            kept_nullifiers.push(nullifiers.array[i]);
        }
    }

    let mut kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen> =
        ClaimedLengthArray::empty();
    for i in 0..logs.length {
        let log = logs.array[i];
        if log.inner.note_hash_counter == 0 {
            // The log is not associated with any note hash.
            kept_logs.push(log);
        } else {
            // Keep the log if it's linked to a note hash in the kept_note_hashes array.
            //
            // Note: Every note log must be linked to either a kept or squashed note hash (see implementation in
            // `validate_log_squashing.nr`). If a log were allowed to link to a non-existent note hash, we would need to
            // keep such logs too. But since that cannot happen, this check is sufficient.
            let is_linked_to_kept_note_hash = kept_note_hashes.array.any(|n: ScopedNoteHash| {
                (n.counter() == log.inner.note_hash_counter)
            });
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
    use dep::types::{
        abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::PrivateLogData},
        tests::utils::assert_array_eq,
    };

    #[test]
    unconstrained fn squash_transient_data_squash_some() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
            NoteHash { value: 33, counter: 3 },
            NoteHash { value: 44, counter: 4 },
            NoteHash { value: 55, counter: 5 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 66, counter: 6, note_hash: 0 },
            Nullifier { value: 77, counter: 7, note_hash: 11 }, // Nullify note_hashes[0]
            Nullifier { value: 88, counter: 8, note_hash: 101 },
            Nullifier { value: 99, counter: 9, note_hash: 44 }, // Nullify note_hashes[3]
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 9, note_hash_counter: 1 }, // Linked to note_hashes[0]
            PrivateLogData { log: mock_log(202), counter: 10, note_hash_counter: 4 }, // Linked to note_hashes[3]
            PrivateLogData { log: mock_log(303), counter: 11, note_hash_counter: 2 },
            PrivateLogData { log: mock_log(404), counter: 12, note_hash_counter: 0 },
            PrivateLogData { log: mock_log(505), counter: 13, note_hash_counter: 1 }, // Linked to note_hashes[0]
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
