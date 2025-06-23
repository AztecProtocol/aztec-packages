use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{Ordered, OrderedValue, scoped::Scoped},
    },
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

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
    // - Ensure the hinted arrays of to-be-propagated notes leave empty space for later padding.
    //    - TODO(MC): is this needed?
    // - Ensure consistency between `is_squashed...hints` and transient_data_index_hints
    let mut squashed_counter = 0;
    for i in 0..NUM_INDEX_HINTS {
        let hint = transient_data_index_hints[i];
        // TODO(MC): avoid overloading the index as a bool flag meaning "not squashed"; it's confusing.
        if hint.nullifier_index == NUM_NULLIFIERS {
            assert_eq(hint.note_hash_index, NUM_NOTE_HASHES, "Invalid transient data index hint");
        } else {
            // We have a hint that points to a (note, nullifier) pair that can be squashed.
            let nullifier = previous_kernel_nullifiers.array[hint.nullifier_index];
            let note_hash = previous_kernel_note_hashes.array[hint.note_hash_index];
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

            // Ensure empty space for later padding:
            let to_be_padded_note_hash =
                expected_kept_note_hashes.array[NUM_NOTE_HASHES - squashed_counter];

            // TODO: might not need to do this, given how we track lengths.
            // TODO: check that the index hints are less than the length,
            // because the arrays are not guaranteed to be padded with empty items beyond length.
            // TODO: this check might be more at home in the next for loop, below, where we're
            // validating the correctness of the data in `expected_kept_note_hashes`.
            to_be_padded_note_hash.assert_empty("Empty note hash must be padded to the right");

            // Padded nullifiers.
            // TODO: might not need to do this, given how we track lengths.
            let to_be_padded_nullifier =
                expected_kept_nullifiers.array[NUM_NULLIFIERS - squashed_counter];
            to_be_padded_nullifier.assert_empty("Empty nullifier must be padded to the right");

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

    let num_squashed = squashed_counter;

    // Assert that when we splice-remove the squashed note hashes from the previous kernel's array,
    // we get an array which matches the hinted `expected_kept_note_hashes`.
    let mut kept_note_hashes_index = 0;
    for i in 0..NUM_NOTE_HASHES {
        if !is_squashed_note_hash_hints[i] {
            assert_eq(
                expected_kept_note_hashes.array[kept_note_hashes_index],
                previous_kernel_note_hashes.array[i],
                "Propagated note hash does not match",
            );
            kept_note_hashes_index += 1;
        }
    }
    assert_eq(
        expected_kept_note_hashes.length,
        previous_kernel_note_hashes.length - num_squashed,
        "Length of squashed array hint is incorrect",
    );
    let num_note_hashes_kept = kept_note_hashes_index;
    assert_eq(
        num_note_hashes_kept + num_squashed,
        NUM_NOTE_HASHES,
        "Wrong number of note hashes removed",
    );

    // Assert that when we splice-remove the squashed nullifiers from the previous kernel's array,
    // we get an array which matches the hinted `expected_kept_nullifiers`.
    let mut kept_nullifiers_index = 0;
    for i in 0..NUM_NULLIFIERS {
        if !is_squashed_nullifier_hints[i] {
            assert_eq(
                expected_kept_nullifiers.array[kept_nullifiers_index],
                previous_kernel_nullifiers.array[i],
                "Propagated nullifier does not match",
            );
            kept_nullifiers_index += 1;
        }
    }
    assert_eq(
        expected_kept_nullifiers.length,
        previous_kernel_nullifiers.length - num_squashed,
        "Length of squashed array hint is incorrect",
    );
    let num_nullifiers_kept = kept_nullifiers_index;
    assert_eq(
        num_nullifiers_kept + num_squashed,
        NUM_NULLIFIERS,
        "Wrong number of nullifiers removed",
    );

    /*
     * Log Squashing
     */
    let mut kept_logs_index = 0;
    let mut squashed_logs_counter = 0;
    for i in 0..NUM_LOGS {
        let log = previous_kernel_logs.array[i];
        let hinted_note_hash_index_for_this_log =
            transient_or_propagated_note_hash_index_for_each_log[i];

        // Logs with 0 note_hash_counter must be propagated, since they do not relate to any note,
        // and therefore cannot ever be squashed.
        // Logs linked to a _propagated_ note hash will also be propagated. In this case, the log's note_hash_counter points to a note hash in expected_kept_note_hashes.
        // TODO: it's quite complicated that the index hint could possibly point to an index in one of two arrays.
        let is_propagated = (log.inner.note_hash_counter == 0)
            | (
                expected_kept_note_hashes.array[hinted_note_hash_index_for_this_log].counter()
                    == log.inner.note_hash_counter
            );

        let expected_index = if is_propagated {
            kept_logs_index
        } else {
            NUM_LOGS - squashed_logs_counter - 1
        };

        let expected_kept_or_empty_log = expected_kept_logs.array[expected_index];
        if is_propagated {
            let expected_kept_log = expected_kept_or_empty_log;
            assert_eq(expected_kept_log, log, "Propagated private log does not match");
            kept_logs_index += 1;
        } else {
            // Log being squashed must be linked to a note hash that's been squashed.
            // The linked note hash's index should exist in transient_data_index_hints.
            let transient_note_hash_index =
                transient_data_index_hints[hinted_note_hash_index_for_this_log].note_hash_index;
            let transient_note_hash = previous_kernel_note_hashes.array[transient_note_hash_index];
            assert_eq(
                // Q: is it sufficient to only assert equality of the counters?
                // TODO: Shouldn't we also be asserting:
                // - equality of contract_address (of log & note hash)
                // - disallow squashing of a non-revertible log and a revertible note hash (and vice versa)
                //    - (I'm not sure why an app would do this, and you could argue it's the app's fault...
                //       If you were to argue it's the app's fault, we could at least put an _unconstrained_
                //       check here, to prevent devs from creating app functions with this footgun).
                log.inner.note_hash_counter,
                transient_note_hash.counter(),
                "Value of the hinted transient note hash does not match log",
            );

            // For each log removed, an empty item is padded to the right.
            // TODO: might not need to do this, given how we track lengths,
            // although asserting empty might be zero cost, so...
            let expected_empty_log = expected_kept_or_empty_log;
            expected_empty_log.assert_empty("Empty log must be padded to the right");
            squashed_logs_counter += 1;
        }
    }

    let num_squashed_logs = squashed_logs_counter;
    assert_eq(expected_kept_logs.length, previous_kernel_logs.length - num_squashed_logs);
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
            let note_hashes = ClaimedLengthArray {
                array: [
                    NoteHash { value: 11, counter: 100 }.scope(contract_address),
                    NoteHash { value: 22, counter: 200 }.scope(contract_address),
                    NoteHash { value: 33, counter: 300 }.scope(contract_address),
                    ScopedNoteHash::empty(),
                    ScopedNoteHash::empty(),
                ],
                length: 3,
            };

            let nullifiers = ClaimedLengthArray {
                array: [
                    Nullifier { value: 44, counter: 400, note_hash: 33 }.scope(contract_address),
                    Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address),
                    Nullifier { value: 66, counter: 600, note_hash: 0 }.scope(contract_address),
                    ScopedNullifier::empty(),
                ],
                length: 3,
            };

            let logs = ClaimedLengthArray {
                array: pad_end(
                    [
                        PrivateLogData { log: mock_log(77), counter: 700, note_hash_counter: 100 }
                            .scope(contract_address),
                        PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 200 }
                            .scope(contract_address),
                        PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 0 }
                            .scope(contract_address),
                    ],
                    Scoped::empty(),
                ),
                length: 3,
            };

            let mut expected_kept_note_hashes = ClaimedLengthArray::<ScopedNoteHash, 5>::empty();
            expected_kept_note_hashes.push(note_hashes.array[1]);
            let mut expected_kept_nullifiers = ClaimedLengthArray::<ScopedNullifier, 4>::empty();
            expected_kept_nullifiers.push(nullifiers.array[2]);
            let mut expected_kept_logs = ClaimedLengthArray::<Scoped<PrivateLogData>, 6>::empty();
            expected_kept_logs.push(logs.array[1]);
            expected_kept_logs.push(logs.array[2]);

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 2 },
                TransientDataIndexHint { nullifier_index: 1, note_hash_index: 0 },
            ];

            let mut transient_or_propagated_note_hash_index_for_each_log = [0; 6];
            transient_or_propagated_note_hash_index_for_each_log[0] = 1; // Points to transient_data_index_hints[1].
            transient_or_propagated_note_hash_index_for_each_log[1] = 0; // Points to expected_kept_note_hashes[0].
            transient_or_propagated_note_hash_index_for_each_log[2] = 3; // This can be any value < NUM_NOTES. The log has 0 note_hash_counter and will always be propagated.
            TestDataBuilder {
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
                split_counter: 0,
            }
        }
    }

    impl TestDataBuilder<3, 3, 4, 3> {
        pub fn new_clear_all() -> Self {
            let note_hashes = ClaimedLengthArray {
                array: [
                    NoteHash { value: 11, counter: 100 }.scope(contract_address),
                    NoteHash { value: 22, counter: 200 }.scope(contract_address),
                    NoteHash { value: 33, counter: 300 }.scope(contract_address),
                ],
                length: 3,
            };

            let nullifiers = ClaimedLengthArray {
                array: [
                    Nullifier { value: 44, counter: 400, note_hash: 33 }.scope(contract_address),
                    Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address),
                    Nullifier { value: 66, counter: 600, note_hash: 22 }.scope(contract_address),
                ],
                length: 3,
            };

            // tests removing two logs for one note hash
            let logs = ClaimedLengthArray {
                array: [
                    PrivateLogData { log: mock_log(77), counter: 700, note_hash_counter: 100 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 300 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 200 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(111), counter: 1000, note_hash_counter: 300 }
                        .scope(contract_address),
                ],
                length: 4,
            };

            let expected_kept_note_hashes = ClaimedLengthArray::<ScopedNoteHash, 3>::empty();
            let expected_kept_nullifiers = ClaimedLengthArray::<ScopedNullifier, 3>::empty();
            let expected_kept_logs = ClaimedLengthArray::<Scoped<PrivateLogData>, 4>::empty();

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 2 },
                TransientDataIndexHint { nullifier_index: 1, note_hash_index: 0 },
                TransientDataIndexHint { nullifier_index: 2, note_hash_index: 1 },
            ];
            let transient_or_propagated_note_hash_index_for_each_log = [1, 0, 2, 0];

            TestDataBuilder {
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
                split_counter: 0,
            }
        }
    }

    impl TestDataBuilder<3, 3, 5, 3> {
        pub fn new_identical_note_hashes() -> Self {
            let note_hashes = ClaimedLengthArray {
                array: [
                    NoteHash { value: 11, counter: 100 }.scope(contract_address),
                    NoteHash { value: 11, counter: 200 }.scope(contract_address),
                    NoteHash { value: 11, counter: 600 }.scope(contract_address),
                ],
                length: 3,
            };

            let nullifiers = ClaimedLengthArray {
                array: [
                    Nullifier { value: 33, counter: 300, note_hash: 11 }.scope(contract_address),
                    Nullifier { value: 44, counter: 400, note_hash: 0 }.scope(contract_address),
                    Nullifier { value: 55, counter: 500, note_hash: 11 }.scope(contract_address),
                ],
                length: 3,
            };

            let logs = ClaimedLengthArray {
                array: [
                    PrivateLogData { log: mock_log(77), counter: 701, note_hash_counter: 200 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(88), counter: 800, note_hash_counter: 0 }.scope(
                        contract_address,
                    ),
                    PrivateLogData { log: mock_log(77), counter: 702, note_hash_counter: 200 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(99), counter: 900, note_hash_counter: 600 }
                        .scope(contract_address),
                    PrivateLogData { log: mock_log(77), counter: 703, note_hash_counter: 200 }
                        .scope(contract_address),
                ],
                length: 5,
            };

            let expected_kept_note_hashes = ClaimedLengthArray {
                array: [note_hashes.array[2], ScopedNoteHash::empty(), ScopedNoteHash::empty()],
                length: 1,
            };
            let expected_kept_nullifiers = ClaimedLengthArray {
                array: [nullifiers.array[1], ScopedNullifier::empty(), ScopedNullifier::empty()],
                length: 1,
            };
            let mut expected_kept_logs = ClaimedLengthArray::<Scoped<PrivateLogData>, 5>::empty();
            expected_kept_logs.push(logs.array[1]);
            expected_kept_logs.push(logs.array[3]);

            let transient_data_index_hints = [
                TransientDataIndexHint { nullifier_index: 0, note_hash_index: 0 },
                TransientDataIndexHint { nullifier_index: 2, note_hash_index: 1 },
                TransientDataIndexHint { nullifier_index: 3, note_hash_index: 3 },
            ];
            let transient_or_propagated_note_hash_index_for_each_log = [1, 0, 1, 0, 1];

            TestDataBuilder {
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
                transient_or_propagated_note_hash_index_for_each_log,
                split_counter: 0,
            }
        }
    }

    impl<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32> TestDataBuilder<NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS, NUM_INDEX_HINTS> {
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

        // Keep the nullifier at index 1 and the note hash at index 0.
        let removed_hint = builder.transient_data_index_hints[0];
        assert_eq(removed_hint.nullifier_index, 0);
        assert_eq(removed_hint.note_hash_index, 2);
        // Update the hint to skip squashing.
        builder.transient_data_index_hints[0] = builder.get_nada_index_hint();
        // Propagate the values.
        builder.expected_kept_note_hashes.array[0] =
            builder.note_hashes.array[removed_hint.note_hash_index];
        builder.expected_kept_nullifiers.array[0] =
            builder.nullifiers.array[removed_hint.nullifier_index];

        // Keep the logs for note hash at index 0.
        builder.transient_or_propagated_note_hash_index_for_each_log[1] = 0; // Point it to the expected not hash at index 0.
        builder.transient_or_propagated_note_hash_index_for_each_log[3] = 0; // Point it to the expected not hash at index 0.
        builder.expected_kept_logs.array[0] = builder.logs.array[1];
        builder.expected_kept_logs.array[1] = builder.logs.array[3];

        builder.verify();
    }

    #[test]
    fn succeeds_identical_note_hashes() {
        TestDataBuilder::new_identical_note_hashes().verify();
    }

    #[test(should_fail_with = "Invalid transient data index hint")]
    fn fails_non_nada_index_hint() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.transient_data_index_hints[0] = builder.get_nada_index_hint();
        // Assign a value to the note_hash_index in a nada index hint.
        builder.transient_data_index_hints[0].note_hash_index = 1;

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

    #[test(should_fail_with = "Empty note hash must be padded to the right")]
    fn fails_unexpected_note_hash_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.expected_kept_note_hashes.array[2].note_hash.value = 11;

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

    #[test(should_fail_with = "Empty note hash must be padded to the right")]
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

    #[test(should_fail_with = "Empty nullifier must be padded to the right")]
    fn fails_unexpected_nullifier_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.expected_kept_nullifiers.array[2].nullifier.value = 11;

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

    #[test(should_fail_with = "Empty log must be padded to the right")]
    fn fails_unexpected_log_value() {
        let mut builder = TestDataBuilder::new_clear_all();

        builder.expected_kept_logs.array[2].inner.log.fields[0] = 1;

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

    #[test(should_fail_with = "Empty log must be padded to the right")]
    fn fails_propagate_too_many_logs() {
        let mut builder = TestDataBuilder::new_clear_all();

        // Keep the log.
        builder.expected_kept_logs.array[1] = builder.logs.array[0];

        builder.verify();
    }
}
