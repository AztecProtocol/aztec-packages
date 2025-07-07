use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{Ordered, OrderedValue, scoped::Scoped},
    },
    utils::arrays::ClaimedLengthArray,
};

fn is_note_hash_for_log(note_hash: ScopedNoteHash, log: Scoped<PrivateLogData>) -> bool {
    (note_hash.counter() == log.inner.note_hash_counter)
        & (note_hash.contract_address == log.contract_address)
}

/// Delineates the indices of transient note_hashes and their nullifiers
pub struct TransientDataIndexHint {
    pub nullifier_index: u32,
    pub note_hash_index: u32,
}

impl TransientDataIndexHint {
    pub fn nada(num_nullifiers: u32, num_note_hashes: u32) -> Self {
        TransientDataIndexHint { nullifier_index: num_nullifiers, note_hash_index: num_note_hashes }
    }
}

pub fn verify_squashed_transient_data_with_hint_indexes<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32>(
    previous_kernel_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    previous_kernel_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    previous_kernel_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>, // hint
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>, // hint
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>, // hint
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS], // hint
    // This array maps each log to its associated note hash index, identifying whether the log corresponds to a transient or propagated note hash.
    // If a log is associated with a propagated note hash, the index refers to its position in the expected_kept_note_hashes array.
    // If a log is associated with a squashed note hash, the index is for the hint in transient_data_index_hints.
    // For non-note logs or empty logs (where note_hash_counter is 0), the value does not matter.
    transient_or_propagated_note_hash_index_for_each_log: [u32; NUM_LOGS], // hint
    split_counter: u32,
    is_squashed_note_hash_hints: [bool; NUM_NOTE_HASHES], // hint
    is_squashed_nullifier_hints: [bool; NUM_NULLIFIERS], // hint
) {
    // - Validate that the hinted-to-be-squashable (note, nullifier) pairs are allowed to be squashed.
    // - Ensure the hinted items are within the claimed lengths of the arrays.
    // - Ensure consistency between `is_squashed...hints` and transient_data_index_hints
    let mut squashed_counter = 0;
    for i in 0..NUM_INDEX_HINTS {
        let hint = transient_data_index_hints[i];
        // Note: Must refer to the note_hash_index instead of the nullifier_index to determine whether to squash a pair,
        // because the note_hash_index is also used later as a hint to squash the logs.
        // TODO: avoid overloading the index as a bool flag meaning "not squashed".
        if hint.note_hash_index != NUM_NOTE_HASHES {
            // We have a hint that points to a (note, nullifier) pair that can be squashed.
            let nullifier = previous_kernel_nullifiers.array[hint.nullifier_index];
            let note_hash = previous_kernel_note_hashes.array[hint.note_hash_index];

            // Ensure the indexes don't exceed the claimed lengths.
            assert(
                hint.nullifier_index < previous_kernel_nullifiers.length,
                "Nullifier index hint exceeds claimed length",
            );
            assert(
                hint.note_hash_index < previous_kernel_note_hashes.length,
                "Note hash index hint exceeds claimed length",
            );

            assert_eq(
                note_hash.value(),
                nullifier.nullified_note_hash(),
                "Value of the hinted transient note hash does not match",
            );
            assert_eq(
                note_hash.contract_address,
                nullifier.contract_address,
                "Contract address of the hinted transient note hash does not match",
            );
            assert(
                nullifier.counter() > note_hash.counter(),
                "Cannot nullify a note hash created afterwards",
            );
            // Note: `>=` is correct, because split_counter is the min_revertible_side_effect_counter.
            // So when a nullifier's counter equals split_counter, the nullifier is revertible,
            // and its corresponding note hash must be revertible, too.
            if nullifier.counter() >= split_counter {
                assert(
                    note_hash.counter() >= split_counter,
                    "Cannot squash a non-revertible note hash with a revertible nullifier",
                );
                // Since the nullifier counter must be larger than the note hash counter, it's not possible to squash a revertible note hash with a non-revertible nullifier.
            }
            squashed_counter += 1;

            // Validate consistency of the `is_squashed...hints`, relative to the
            // transient_data_index_hints, so they can be used next.
            assert(
                is_squashed_note_hash_hints[hint.note_hash_index],
                "Wrong squashed note hash hint",
            );
            assert(
                is_squashed_nullifier_hints[hint.nullifier_index],
                "Wrong squashed nullifier hint",
            );
        }
    }

    // Assert that when we splice-remove the squashed note hashes from the previous kernel's array,
    // we get an array which matches the hinted `expected_kept_note_hashes`.
    let mut kept_note_hashes_counter = 0;
    for i in 0..NUM_NOTE_HASHES {
        if !is_squashed_note_hash_hints[i] {
            assert_eq(
                expected_kept_note_hashes.array[kept_note_hashes_counter],
                previous_kernel_note_hashes.array[i],
                "Propagated note hash does not match",
            );
            kept_note_hashes_counter += 1;
        }
    }
    assert_eq(
        expected_kept_note_hashes.length,
        previous_kernel_note_hashes.length - squashed_counter,
        "Length of expected kept note hashes array is incorrect",
    );
    assert_eq(
        kept_note_hashes_counter + squashed_counter,
        NUM_NOTE_HASHES,
        "Wrong number of note hashes removed",
    );

    // Assert that when we splice-remove the squashed nullifiers from the previous kernel's array,
    // we get an array which matches the hinted `expected_kept_nullifiers`.
    let mut kept_nullifiers_counter = 0;
    for i in 0..NUM_NULLIFIERS {
        if !is_squashed_nullifier_hints[i] {
            assert_eq(
                expected_kept_nullifiers.array[kept_nullifiers_counter],
                previous_kernel_nullifiers.array[i],
                "Propagated nullifier does not match",
            );
            kept_nullifiers_counter += 1;
        }
    }
    assert_eq(
        expected_kept_nullifiers.length,
        previous_kernel_nullifiers.length - squashed_counter,
        "Length of expected kept nullifiers array is incorrect",
    );
    assert_eq(
        kept_nullifiers_counter + squashed_counter,
        NUM_NULLIFIERS,
        "Wrong number of nullifiers removed",
    );

    /*
     * Log Squashing
     */
    let mut kept_logs_counter = 0;
    for i in 0..NUM_LOGS {
        let log = previous_kernel_logs.array[i];
        let hinted_note_hash_index_for_this_log =
            transient_or_propagated_note_hash_index_for_each_log[i];

        let is_note_log = log.inner.note_hash_counter != 0;
        let expected_kept_note_hash =
            expected_kept_note_hashes.array[hinted_note_hash_index_for_this_log];
        // Logs with 0 note_hash_counter must be propagated, since they do not relate to any note,
        // and therefore cannot ever be squashed.
        // Logs linked to a _propagated_ note hash will also be propagated. In this case, the log's note_hash_counter points to a note hash in expected_kept_note_hashes.
        // TODO: it's quite complicated that the index hint could possibly point to an index in one of two arrays.
        let is_propagated = !is_note_log | is_note_hash_for_log(expected_kept_note_hash, log);

        // This is only used if is_propagated is true. But it's cheaper to declare it outside of the if statement.
        let expected_kept_log = expected_kept_logs.array[kept_logs_counter];

        if is_propagated {
            assert_eq(expected_kept_log, log, "Propagated private log does not match");

            // If the log is linked to a note, then the index of the linked note hash must be less than the claimed
            // length of the source array.
            if is_note_log {
                assert(
                    hinted_note_hash_index_for_this_log < expected_kept_note_hashes.length,
                    "Kept note hash index exceeds claimed length",
                );
            }

            kept_logs_counter += 1;
        } else {
            // Log being squashed must be linked to a note hash that's been squashed.
            // The linked note hash's index should exist in transient_data_index_hints.
            let transient_note_hash_index =
                transient_data_index_hints[hinted_note_hash_index_for_this_log].note_hash_index;
            let transient_note_hash = previous_kernel_note_hashes.array[transient_note_hash_index];

            // Don't need to check transient_note_hash_index is within the claimed length, because it's already been
            // checked when the hint was used to squash the note hash.

            assert_eq(
                log.contract_address,
                transient_note_hash.contract_address,
                "Contract address of the hinted transient note hash does not match log",
            );

            assert_eq(
                // Consider disallowing squashing of a non-revertible log and a revertible note hash (and vice versa)
                //    - (I'm not sure why an app would do this, and you could argue it's the app's fault...
                //       If you were to argue it's the app's fault, we could at least put an _unconstrained_
                //       check here, to prevent devs from creating app functions with this footgun).
                log.inner.note_hash_counter,
                transient_note_hash.counter(),
                "Value of the hinted transient note hash does not match log",
            );
        }
    }

    // Note: We can't compare expected_kept_logs.length with the kept_logs_counter directly, because the counter also
    // includes logs that are empty.
    let num_squashed_logs = NUM_LOGS - kept_logs_counter;
    assert_eq(
        expected_kept_logs.length,
        previous_kernel_logs.length - num_squashed_logs,
        "Length of expected kept logs array is incorrect",
    );
}

// Q: We already computed a load of hints relating to squashing earlier. Why weren't these computed back then?
// A: TODO: I haven't got the chance to refactor this, I wanted to bring the functions that create hints to the file
// that verifies the data, and generate the hints in the main function using the data to be verified whenever possible.
// And if the hints are used outside of the function, then they will be given as args, like the
// expected_kept_ arrays here. But the functions creating them will also live here.
// And of course, there's always a function verify_with_hints that the main function calls,
// so that we can test the cases where the hints are tweaked.
// I think it's easier to see how the hints are created and used, and easier to test them all together.
pub unconstrained fn get_squashed_note_hash_hints<let NUM_INDEX_HINTS: u32, let NUM_NOTE_HASHES: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [bool; NUM_NOTE_HASHES] {
    let mut hints = [false; NUM_NOTE_HASHES];
    for i in 0..transient_data_index_hints.len() {
        let note_hash_index = transient_data_index_hints[i].note_hash_index;
        // TODO: consider using Option::none
        if note_hash_index != NUM_NOTE_HASHES {
            hints[note_hash_index] = true;
        }
    }
    hints
}

pub unconstrained fn get_squashed_nullifier_hints<let NUM_INDEX_HINTS: u32, let NUM_NULLIFIERS: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [bool; NUM_NULLIFIERS] {
    let mut hints = [false; NUM_NULLIFIERS];
    for i in 0..transient_data_index_hints.len() {
        let nullifier_index = transient_data_index_hints[i].nullifier_index;
        if nullifier_index != NUM_NULLIFIERS {
            hints[nullifier_index] = true;
        }
    }
    hints
}

pub fn verify_squashed_transient_data<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    transient_or_propagated_note_hash_index_for_each_log: [u32; NUM_LOGS],
    split_counter: u32,
) {
    // Safety: The hints are verified below by verify_squashed_transient_data_with_hint_indexes.
    let is_squashed_note_hash_hints =
        unsafe { get_squashed_note_hash_hints(transient_data_index_hints) };

    // Safety: The hints are verified below by verify_squashed_transient_data_with_hint_indexes.
    let is_squashed_nullifier_hints =
        unsafe { get_squashed_nullifier_hints(transient_data_index_hints) };

    verify_squashed_transient_data_with_hint_indexes(
        note_hashes,
        nullifiers,
        logs,
        expected_kept_note_hashes,
        expected_kept_nullifiers,
        expected_kept_logs,
        transient_data_index_hints,
        transient_or_propagated_note_hash_index_for_each_log,
        split_counter,
        is_squashed_note_hash_hints,
        is_squashed_nullifier_hints,
    );
}

mod tests {
    use crate::reset::transient_data::{
        get_squashed_note_hash_hints, get_squashed_nullifier_hints, TransientDataIndexHint,
        verify_squashed_transient_data, verify_squashed_transient_data_with_hint_indexes,
    };
    use dep::types::{
        abis::{
            note_hash::{NoteHash, ScopedNoteHash},
            nullifier::{Nullifier, ScopedNullifier},
            private_log::{PrivateLog, PrivateLogData},
            side_effect::{Ordered, scoped::Scoped},
        },
        address::AztecAddress,
        constants::PRIVATE_LOG_SIZE_IN_FIELDS,
        tests::utils::pad_end,
        traits::{Empty, FromField},
        utils::arrays::ClaimedLengthArray,
    };

    global contract_address: AztecAddress = AztecAddress::from_field(987654);

    fn mock_log(filled_with: Field) -> PrivateLog {
        PrivateLog::new(
            [filled_with; PRIVATE_LOG_SIZE_IN_FIELDS],
            PRIVATE_LOG_SIZE_IN_FIELDS,
        )
    }

    struct TestDataBuilder<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32> {
        note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
        nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
        logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
        expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
        expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
        expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
        transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
        transient_or_propagated_note_hash_index_for_each_log: [u32; NUM_LOGS],
        split_counter: u32,
    }

    impl TestDataBuilder<5, 4, 6, 2> {
        pub fn new() -> Self {
            let note_hashes = [
                NoteHash { value: 11, counter: 100 }.scope(contract_address), // Nullified by nullifiers[1]
                NoteHash { value: 22, counter: 200 }.scope(contract_address),
                NoteHash { value: 33, counter: 300 }.scope(contract_address), // Nullified by nullifiers[0]
            ];

            let nullifiers = [
                Nullifier { value: 44, counter: 400, note_hash: 33 }.scope(contract_address), // Nullify note_hashes[2]
                Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address), // Nullify note_hashes[0]
                Nullifier { value: 66, counter: 600, note_hash: 0 }.scope(contract_address),
            ];

            let logs = [
                PrivateLogData { log: mock_log(77), counter: 700, note_hash_counter: 100 }.scope(
                    // Linked to note_hashes[0]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 200 }.scope(
                    // Linked to note_hashes[1]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 0 }.scope(
                    contract_address,
                ),
            ];

            let expected_kept_note_hashes = [note_hashes[1]];

            let expected_kept_nullifiers = [nullifiers[2]];

            let expected_kept_logs = [logs[1], logs[2]];

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 2 },
                TransientDataIndexHint { nullifier_index: 1, note_hash_index: 0 },
            ];

            let transient_or_propagated_note_hash_index_for_each_log = [
                1, // Points to transient_data_index_hints[1].
                0, // Points to expected_kept_note_hashes[0].
                3, // This can be any value < NUM_NOTES. The log has 0 note_hash_counter and will always be propagated.
            ];

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
            )
        }
    }

    impl TestDataBuilder<4, 4, 4, 3> {
        // Create a test case where all notes are nullified, and therefore squashed.
        pub fn new_clear_all() -> Self {
            let note_hashes = [
                NoteHash { value: 11, counter: 100 }.scope(contract_address), // Nullified by nullifiers[1]
                NoteHash { value: 22, counter: 200 }.scope(contract_address), // Nullified by nullifiers[2]
                NoteHash { value: 33, counter: 300 }.scope(contract_address), // Nullified by nullifiers[0]
            ];

            let nullifiers = [
                Nullifier { value: 44, counter: 400, note_hash: 33 }.scope(contract_address), // Nullify note_hashes[2]
                Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address), // Nullify note_hashes[0]
                Nullifier { value: 66, counter: 600, note_hash: 22 }.scope(contract_address), // Nullify note_hashes[1]
            ];

            let logs = [
                PrivateLogData { log: mock_log(77), counter: 700, note_hash_counter: 100 }.scope(
                    // Linked to note_hashes[0]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 300 }.scope(
                    // Linked to note_hashes[2]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 200 }.scope(
                    // Linked to note_hashes[1]
                    contract_address,
                ),
            ];

            let expected_kept_note_hashes = [];
            let expected_kept_nullifiers = [];
            let expected_kept_logs = [];

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 2 },
                TransientDataIndexHint { nullifier_index: 1, note_hash_index: 0 },
                TransientDataIndexHint { nullifier_index: 2, note_hash_index: 1 },
            ];

            let transient_or_propagated_note_hash_index_for_each_log = [
                1, // Points to transient_data_index_hints[1].
                0, // Points to transient_data_index_hints[0].
                2, // Points to transient_data_index_hints[2].
            ];

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
            )
        }
    }

    impl TestDataBuilder<3, 3, 5, 3> {
        pub fn new_identical_note_hashes() -> Self {
            let note_hashes = [
                NoteHash { value: 11, counter: 100 }.scope(contract_address), // Nullified by nullifiers[0]
                NoteHash { value: 11, counter: 200 }.scope(contract_address), // Nullified by nullifiers[2]
                NoteHash { value: 11, counter: 600 }.scope(contract_address),
            ];

            let nullifiers = [
                Nullifier { value: 33, counter: 300, note_hash: 11 }.scope(contract_address), // Nullify note_hashes[0]
                Nullifier { value: 44, counter: 400, note_hash: 0 }.scope(contract_address),
                Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address), // Nullify note_hashes[1]
            ];

            let logs = [
                PrivateLogData { log: mock_log(77), counter: 701, note_hash_counter: 200 }.scope(
                    // Linked to note_hashes[1]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 0 }.scope(
                    contract_address,
                ),
                PrivateLogData { log: mock_log(77), counter: 702, note_hash_counter: 100 }.scope(
                    // Linked to note_hashes[0]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 600 }.scope(
                    // Linked to note_hashes[2]
                    contract_address,
                ),
            ];

            let expected_kept_note_hashes = [note_hashes[2]];

            let expected_kept_nullifiers = [nullifiers[1]];

            let expected_kept_logs = [logs[1], logs[3]];

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 0 },
                TransientDataIndexHint { nullifier_index: 2, note_hash_index: 1 },
                TransientDataIndexHint { nullifier_index: 3, note_hash_index: 3 },
            ];

            let transient_or_propagated_note_hash_index_for_each_log = [
                1, // Points to transient_data_index_hints[1].
                0, // Can be any value < NUM_NOTE_HASHES. The log has 0 note_hash_counter and will always be propagated.
                0, // Points to transient_data_index_hints[0].
                0, // Point to expected_kept_note_hashes[0].
            ];

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
            )
        }
    }

    impl TestDataBuilder<5, 4, 6, 2> {
        pub fn new_identical_linked_note_hash() -> Self {
            let note_hashes = [
                NoteHash { value: 11, counter: 100 }.scope(contract_address),
                NoteHash { value: 22, counter: 200 }.scope(contract_address), // Nullified by nullifiers[0]
                NoteHash { value: 33, counter: 300 }.scope(contract_address),
            ];

            let nullifiers = [Nullifier { value: 44, counter: 400, note_hash: 22 }.scope(
                // Nullify note_hashes[1]
                contract_address,
            )];

            let logs = [
                PrivateLogData { log: mock_log(66), counter: 600, note_hash_counter: 300 }.scope(
                    // Linked to note_hashes[2]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(77), counter: 700, note_hash_counter: 200 }.scope(
                    // Linked to note_hashes[1]
                    contract_address,
                ), // Squashing with note_hashes[1]
                PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 300 }.scope(
                    // Linked to note_hashes[2]
                    contract_address,
                ),
                PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 200 }.scope(
                    // Linked to note_hashes[1]
                    contract_address,
                ), // Squashing with note_hashes[1]
            ];

            let expected_kept_note_hashes = [note_hashes[0], note_hashes[2]];

            let expected_kept_nullifiers = [];

            let expected_kept_logs = [logs[0], logs[2]];

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 1 },
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 5 }, // Set the note_hash_index to NUM_NOTE_HASHES to indicate that the note hash is not squashed.
            ];

            let transient_or_propagated_note_hash_index_for_each_log = [
                1, // Points to expected_kept_note_hashes[1]
                0, // Points to transient_data_index_hints[0]
                1, // Points to expected_kept_note_hashes[1]
                0, // Points to transient_data_index_hints[0]
            ];

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
            )
        }
    }

    impl<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32> TestDataBuilder<NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS, NUM_INDEX_HINTS> {
        pub fn from_active_arrays<let N: u32, let M: u32, let P: u32, let Q: u32, let R: u32, let S: u32>(
            note_hashes: [ScopedNoteHash; N],
            nullifiers: [ScopedNullifier; M],
            logs: [Scoped<PrivateLogData>; P],
            expected_kept_note_hashes: [ScopedNoteHash; Q],
            expected_kept_nullifiers: [ScopedNullifier; R],
            expected_kept_logs: [Scoped<PrivateLogData>; S],
            transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
            transient_or_propagated_note_hash_index_for_each_log: [u32; P],
        ) -> Self {
            TestDataBuilder {
                note_hashes: ClaimedLengthArray {
                    array: pad_end(note_hashes, ScopedNoteHash::empty()),
                    length: note_hashes.len(),
                },
                nullifiers: ClaimedLengthArray {
                    array: pad_end(nullifiers, ScopedNullifier::empty()),
                    length: nullifiers.len(),
                },
                logs: ClaimedLengthArray {
                    array: pad_end(logs, Scoped::empty()),
                    length: logs.len(),
                },
                expected_kept_note_hashes: ClaimedLengthArray {
                    array: pad_end(expected_kept_note_hashes, ScopedNoteHash::empty()),
                    length: expected_kept_note_hashes.len(),
                },
                expected_kept_nullifiers: ClaimedLengthArray {
                    array: pad_end(expected_kept_nullifiers, ScopedNullifier::empty()),
                    length: expected_kept_nullifiers.len(),
                },
                expected_kept_logs: ClaimedLengthArray {
                    array: pad_end(expected_kept_logs, Scoped::empty()),
                    length: expected_kept_logs.len(),
                },
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log: pad_end(
                    transient_or_propagated_note_hash_index_for_each_log,
                    0,
                ),
                split_counter: 0,
            }
        }

        pub fn get_nada_index_hint(_self: Self) -> TransientDataIndexHint {
            TransientDataIndexHint {
                nullifier_index: NUM_NULLIFIERS,
                note_hash_index: NUM_NOTE_HASHES,
            }
        }

        pub fn get_hint_indexes(self) -> ([bool; NUM_NOTE_HASHES], [bool; NUM_NULLIFIERS]) {
            // Safety: This is only used in tests.
            let squashed_note_hash_hints =
                unsafe { get_squashed_note_hash_hints(self.transient_data_index_hints) };
            // Safety: This is only used in tests.
            let squashed_nullifier_hints =
                unsafe { get_squashed_nullifier_hints(self.transient_data_index_hints) };
            (squashed_note_hash_hints, squashed_nullifier_hints)
        }

        pub fn verify(self) {
            verify_squashed_transient_data(
                self.note_hashes,
                self.nullifiers,
                self.logs,
                self.expected_kept_note_hashes,
                self.expected_kept_nullifiers,
                self.expected_kept_logs,
                self.transient_data_index_hints,
                self.transient_or_propagated_note_hash_index_for_each_log,
                self.split_counter,
            );
        }

        pub fn verify_with_hint_indexes(
            self,
            squashed_note_hash_hints: [bool; NUM_NOTE_HASHES],
            squashed_nullifier_hints: [bool; NUM_NULLIFIERS],
        ) {
            verify_squashed_transient_data_with_hint_indexes(
                self.note_hashes,
                self.nullifiers,
                self.logs,
                self.expected_kept_note_hashes,
                self.expected_kept_nullifiers,
                self.expected_kept_logs,
                self.transient_data_index_hints,
                self.transient_or_propagated_note_hash_index_for_each_log,
                self.split_counter,
                squashed_note_hash_hints,
                squashed_nullifier_hints,
            );
        }
    }

    #[test]
    fn succeeds_clear_all() {
        TestDataBuilder::new_clear_all().verify();
    }

    #[test]
    fn succeeds_with_propagated_values() {
        TestDataBuilder::new().verify();
    }

    #[test]
    fn succeeds_partially_propagated() {
        let mut builder = TestDataBuilder::new_clear_all();

        // Keep the nullifier at index 0 and the note hash at index 2.
        let removed_hint = builder.transient_data_index_hints[0];
        assert_eq(removed_hint.nullifier_index, 0);
        assert_eq(removed_hint.note_hash_index, 2);
        // Update the hint to skip squashing.
        builder.transient_data_index_hints[0] = builder.get_nada_index_hint();
        // Propagate the values.
        builder.expected_kept_note_hashes.push(
            builder.note_hashes.array[removed_hint.note_hash_index],
        );
        builder.expected_kept_nullifiers.push(
            builder.nullifiers.array[removed_hint.nullifier_index],
        );

        // Keep the logs for note hash at index 2.
        builder.transient_or_propagated_note_hash_index_for_each_log[1] = 0; // Point it to the expected note hash at index 0.
        builder.expected_kept_logs.push(builder.logs.array[1]);

        builder.verify();
    }

    #[test]
    fn succeeds_identical_note_hashes() {
        TestDataBuilder::new_identical_note_hashes().verify();
    }

    #[test(should_fail_with = "Nullifier index hint exceeds claimed length")]
    fn fails_referring_to_nullifier_beyond_claimed_length() {
        let mut builder = TestDataBuilder::new();

        let note_hash = builder.note_hashes.array[0];

        // Create a nullifier beyond the claimed length.
        let claimed_length = builder.nullifiers.length;
        builder.nullifiers.array[claimed_length] = Nullifier {
            value: 999,
            counter: 9999,
            note_hash: note_hash.note_hash.value,
        }
            .scope(note_hash.contract_address);

        // Create a hint to nullify a note hash using the above nullifier.
        builder.transient_data_index_hints[0].nullifier_index = claimed_length;
        builder.transient_data_index_hints[0].note_hash_index = 0;

        builder.verify();
    }

    #[test(should_fail_with = "Note hash index hint exceeds claimed length")]
    fn fails_referring_to_note_hash_beyond_claimed_length() {
        let mut builder = TestDataBuilder::new();

        let nullifier = builder.nullifiers.array[0];

        // Create a note hash beyond the claimed length.
        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length] = NoteHash {
            value: nullifier.nullifier.note_hash,
            counter: 1,
        }
            .scope(nullifier.contract_address);

        // Create a hint to nullify the fake note hash.
        builder.transient_data_index_hints[0].nullifier_index = 0;
        builder.transient_data_index_hints[0].note_hash_index = claimed_length;

        builder.verify();
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match")]
    fn fails_mismatch_note_hash_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.note_hashes.array[1].note_hash.value += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Contract address of the hinted transient note hash does not match")]
    fn fails_mismatch_contract_address() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.note_hashes.array[1].contract_address.inner += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Cannot nullify a note hash created afterwards")]
    fn fails_nullify_note_hash_emitted_afterwards() {
        let mut builder = TestDataBuilder::new();

        // Make the nullifier at index 1 to have a smaller counter than its note hash.
        let hint = builder.transient_data_index_hints[1];
        let note_hash_counter = builder.note_hashes.array[hint.note_hash_index].counter();
        builder.nullifiers.array[hint.nullifier_index].nullifier.counter = note_hash_counter - 1;

        builder.verify();
    }

    #[test(should_fail_with = "Cannot squash a non-revertible note hash with a revertible nullifier")]
    fn fails_nullify_non_revertible_note_hash_with_revertible_nullifier() {
        let mut builder = TestDataBuilder::new();

        let hint = builder.transient_data_index_hints[1];
        let note_hash_counter = builder.note_hashes.array[hint.note_hash_index].counter();
        // Make the note hash non-revertible.
        builder.split_counter = note_hash_counter + 1;

        builder.verify();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_wrong_expected_note_hash_value() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_note_hashes.array[0].note_hash.value += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_wrong_expected_note_hash_counter() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_note_hashes.array[0].note_hash.counter += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Wrong squashed note hash hint")]
    fn fails_wrong_note_hash_squashed_hint() {
        let mut builder = TestDataBuilder::new_clear_all();

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        squashed_note_hash_hints[0] = false;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test]
    fn succeeds_unexpected_note_hash_value_after_claimed_length() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length].note_hash.value = 999;

        let claimed_length = builder.expected_kept_note_hashes.length;
        builder.expected_kept_note_hashes.array[claimed_length].note_hash.value = 999;

        builder.verify();
    }

    #[test(should_fail_with = "Length of expected kept note hashes array is incorrect")]
    fn fails_extra_expected_note_hash_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length].note_hash.value = 999;

        let claimed_length = builder.expected_kept_note_hashes.length;
        builder.expected_kept_note_hashes.array[claimed_length].note_hash.value = 999;

        // Increase the claimed length.
        builder.expected_kept_note_hashes.length += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Wrong squashed note hash hint")]
    fn fails_propagate_note_hash_for_squashed_nullifier() {
        let mut builder = TestDataBuilder::new_clear_all();

        // Propagate the note hash at index 1.
        builder.expected_kept_note_hashes.array[0] = builder.note_hashes.array[1];

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        // Set the hint to false so it's assumed the note hash has not been squashed.
        squashed_note_hash_hints[1] = false;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test(should_fail_with = "Wrong number of note hashes removed")]
    fn fails_identical_note_hashes_nullify_same_note_hash() {
        let mut builder = TestDataBuilder::new_identical_note_hashes();

        assert_eq(builder.transient_data_index_hints[1].note_hash_index, 1);
        // Make the nullifier at index 2 to also nullify the note hash at index 0.
        builder.transient_data_index_hints[1].note_hash_index = 0;
        // Propagate the note hashes at index 1 and 2.
        builder.expected_kept_note_hashes.array[0] = builder.note_hashes.array[1];
        builder.expected_kept_note_hashes.array[1] = builder.note_hashes.array[2];

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        // Set the hint to false so it's assumed the note hash has not been squashed.
        squashed_note_hash_hints[1] = false;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test(should_fail_with = "Wrong number of note hashes removed")]
    fn fails_note_hash_not_propagated() {
        let mut builder = TestDataBuilder::new();

        // Do not propagate any note hashes.
        builder.expected_kept_note_hashes.array[0] = ScopedNoteHash::empty();

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        assert_eq(squashed_note_hash_hints[1], false);
        // Set the hint to true so it's assumed the note hash has been squashed.
        squashed_note_hash_hints[1] = true;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_wrong_expected_nullifier_value() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_nullifiers.array[0].nullifier.value += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_wrong_expected_nullifier_counter() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_nullifiers.array[0].nullifier.counter += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Wrong squashed nullifier hint")]
    fn fails_wrong_nullifier_hint_index() {
        let mut builder = TestDataBuilder::new_clear_all();

        // Propagate the nullifier at index 1.
        builder.expected_kept_nullifiers.array[0] = builder.nullifiers.array[1];

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        // Set the hint to false so it's assumed the note hash has not been squashed.
        squashed_nullifier_hints[1] = false;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test]
    fn succeeds_unexpected_nullifier_value_after_claimed_length() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.nullifiers.length;
        builder.nullifiers.array[claimed_length].nullifier.value = 999;

        let claimed_length = builder.expected_kept_nullifiers.length;
        builder.expected_kept_nullifiers.array[claimed_length].nullifier.value = 999;

        builder.verify();
    }

    #[test(should_fail_with = "Length of expected kept nullifiers array is incorrect")]
    fn fails_extra_expected_nullifier_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.nullifiers.length;
        builder.nullifiers.array[claimed_length].nullifier.value = 999;

        let claimed_length = builder.expected_kept_nullifiers.length;
        builder.expected_kept_nullifiers.array[claimed_length].nullifier.value = 999;

        // Increase the claimed length.
        builder.expected_kept_nullifiers.length += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Wrong number of nullifiers removed")]
    fn fails_propagate_nullifier_for_squashed_note_hash() {
        let mut builder = TestDataBuilder::new();

        // Do not propagate any nullifiers.
        builder.expected_kept_nullifiers.array[0] = ScopedNullifier::empty();

        let mut (squashed_note_hash_hints, squashed_nullifier_hints) = builder.get_hint_indexes();
        // Set the hint to true so it's assumed the note hash has been squashed.
        squashed_nullifier_hints[2] = true;

        builder.verify_with_hint_indexes(squashed_note_hash_hints, squashed_nullifier_hints);
    }

    #[test]
    fn succeeds_unexpected_log_value_after_claimed_length() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.logs.length;
        builder.logs.array[claimed_length].inner.log.fields[0] = 999;

        let claimed_length = builder.expected_kept_logs.length;
        builder.expected_kept_logs.array[claimed_length].inner.log.fields[0] = 999;

        builder.verify();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_extra_expected_log_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        let claimed_length = builder.logs.length;
        builder.logs.array[claimed_length].inner.log.fields[0] = 999;

        let claimed_length = builder.expected_kept_logs.length;
        builder.expected_kept_logs.array[claimed_length].inner.log.fields[0] = 999;

        // Increase the claimed length.
        builder.expected_kept_logs.length += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Kept note hash index exceeds claimed length")]
    fn fails_propagate_extra_log_linked_to_fake_kept_note_hash() {
        let mut builder = TestDataBuilder::new_clear_all();

        let fake_log_index = builder.logs.length;
        builder.logs.array[fake_log_index].inner.log.fields[0] = 999;

        let fake_kept_log_index = builder.expected_kept_logs.length;
        builder.expected_kept_logs.array[fake_kept_log_index].inner.log.fields[0] = 999;

        // Increase the claimed length.
        builder.expected_kept_logs.length += 1;

        // Add an extra note to the expected kept note hashes array.
        let fake_note_index = builder.logs.length;
        builder.note_hashes.array[fake_note_index].note_hash.counter = 111;

        let fake_kept_note_hash_index = builder.expected_kept_note_hashes.length;
        builder.expected_kept_note_hashes.array[fake_kept_note_hash_index].note_hash.counter = 111;

        // Link the log to the fake note hash.
        builder.logs.array[fake_log_index].inner.note_hash_counter = 111;
        builder.expected_kept_logs.array[fake_kept_log_index].inner.note_hash_counter = 111;

        // Update the hint to point to the fake note hash index.
        builder.transient_or_propagated_note_hash_index_for_each_log[fake_log_index] =
            fake_kept_note_hash_index;

        builder.verify();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_wrong_expected_log_value() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_logs.array[0].inner.log.fields[0] += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_wrong_expected_log_counter() {
        let mut builder = TestDataBuilder::new();

        builder.expected_kept_logs.array[0].inner.counter += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Contract address of the hinted transient note hash does not match log")]
    fn fails_mismatch_log_contract_address() {
        let mut builder = TestDataBuilder::new();

        // Change the contract address of the log linked to a transient note hash.
        builder.logs.array[0].contract_address.inner += 1;

        builder.verify();
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match log")]
    fn fails_log_not_nullified() {
        let mut builder = TestDataBuilder::new();

        builder.transient_or_propagated_note_hash_index_for_each_log[1] = 1;

        builder.verify();
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match log")]
    fn fails_wrong_log_note_hash() {
        let mut builder = TestDataBuilder::new();

        builder.logs.array[0].inner.note_hash_counter += 1;

        builder.verify();
    }

    #[test]
    fn succeeds_linking_more_than_one_log_with_same_note_hash() {
        TestDataBuilder::new_identical_linked_note_hash().verify();
    }
}
