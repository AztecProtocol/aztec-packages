pub(crate) mod is_squashed_hint;
pub(crate) mod nullifier_index_hint_sorted_tuple;
pub(crate) mod note_log_hint;

use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::PrivateLogData,
        side_effect::{Ordered, OrderedValue, scoped::Scoped},
    },
    utils::arrays::{ClaimedLengthArray, find_index_hint, SortedTuple},
};
use is_squashed_hint::{get_is_squashed_note_hash_hints, get_is_squashed_nullifier_hints};
use note_log_hint::{get_note_log_hints, NoteLogHint};
use nullifier_index_hint_sorted_tuple::get_nullifier_index_hint_sorted_tuples;

fn is_log_linked_to_note_hash(log: Scoped<PrivateLogData>, note_hash: ScopedNoteHash) -> bool {
    (log.inner.note_hash_counter == note_hash.counter())
        & (log.contract_address == note_hash.contract_address)
}

/// Delineates the indices of transient note_hashes and their nullifiers
pub struct TransientDataIndexHint {
    pub nullifier_index: u32,
    pub note_hash_index: u32,
}

impl TransientDataIndexHint {
    pub fn skip(num_nullifiers: u32, num_note_hashes: u32) -> Self {
        TransientDataIndexHint { nullifier_index: num_nullifiers, note_hash_index: num_note_hashes }
    }
}

struct DerivedHints<let NUM_INDEX_HINTS: u32, let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32> {
    num_squashed_note_hash_nullifier_pairs: u32,
    nullifier_index_hint_sorted_tuples: [SortedTuple<u32>; NUM_INDEX_HINTS],
    is_squashed_note_hash_hints: [bool; NUM_NOTE_HASHES],
    is_squashed_nullifier_hints: [bool; NUM_NULLIFIERS],
    note_log_hints: [NoteLogHint; NUM_LOGS],
}

unconstrained fn get_derived_hints<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
) -> DerivedHints<NUM_INDEX_HINTS, NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS> {
    // If the hinted `note_hash_index` is invalid (i.e., `note_hash_index == NUM_NOTE_HASHES`), we skip the squashing.
    //
    // Because the number of squashable pairs may be less than the hints array length (`NUM_INDEX_HINTS`), we can skip a
    // hint by setting the `note_hash_index` to the length of the note hashes array (`NUM_NOTE_HASHES`).
    //
    // Once a hint with `note_hash_index == NUM_NOTE_HASHES` is encountered, all subsequent hints must be unused.
    // This makes it easier to ensure that the active hints are unique (see the implementation of
    // `verify_squashed_transient_data_with_derived_hints` for more details).
    let num_squashed_note_hash_nullifier_pairs = find_index_hint(
        transient_data_index_hints,
        |hint| hint.note_hash_index == NUM_NOTE_HASHES,
    )
        .unwrap_or(NUM_INDEX_HINTS);

    let nullifier_index_hint_sorted_tuples =
        get_nullifier_index_hint_sorted_tuples(transient_data_index_hints);

    let is_squashed_note_hash_hints = get_is_squashed_note_hash_hints(transient_data_index_hints);

    let is_squashed_nullifier_hints =
        get_is_squashed_nullifier_hints(transient_data_index_hints, NUM_NOTE_HASHES);

    let note_log_hints = get_note_log_hints(
        logs,
        note_hashes,
        expected_kept_note_hashes,
        transient_data_index_hints,
    );

    DerivedHints {
        num_squashed_note_hash_nullifier_pairs,
        nullifier_index_hint_sorted_tuples,
        is_squashed_note_hash_hints,
        is_squashed_nullifier_hints,
        note_log_hints,
    }
}

pub fn verify_squashed_transient_data<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    // Hints provided by the user to specify what to squash.
    // These are not derived automatically in this function like other hints, because the user can choose to not
    // squash a pair even if it's squashable. The transient data might be useful in later iterations. For example, a
    // note hash must be kept to be used for a note hash read request created in a later iteration, and can only be
    // squashed after the read request is validated.
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    min_revertible_side_effect_counter: u32,
) {
    // Safety: The hints are verified below by verify_squashed_transient_data_with_derived_hints.
    let derived_hints = unsafe {
        get_derived_hints(
            transient_data_index_hints,
            note_hashes,
            expected_kept_note_hashes,
            logs,
        )
    };

    verify_squashed_transient_data_with_derived_hints(
        note_hashes,
        nullifiers,
        logs,
        expected_kept_note_hashes,
        expected_kept_nullifiers,
        expected_kept_logs,
        min_revertible_side_effect_counter,
        transient_data_index_hints,
        derived_hints,
    );
}

fn verify_squashed_transient_data_with_derived_hints<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NUM_NULLIFIERS>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    min_revertible_side_effect_counter: u32,
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    derived_hints: DerivedHints<NUM_INDEX_HINTS, NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS>,
) {
    let num_squashed_note_hash_nullifier_pairs =
        derived_hints.num_squashed_note_hash_nullifier_pairs;
    let nullifier_index_hint_sorted_tuples = derived_hints.nullifier_index_hint_sorted_tuples;
    let is_squashed_note_hash_hints = derived_hints.is_squashed_note_hash_hints;
    let is_squashed_nullifier_hints = derived_hints.is_squashed_nullifier_hints;
    let note_log_hints = derived_hints.note_log_hints;

    // =================================
    // Note Hash and Nullifier Squashing
    // =================================
    //
    // This loop iterates over the hints `transient_data_index_hints` and validates that each (note hash, nullifier)
    // pair is eligible to be squashed.
    //
    // We iterate over the hints directly (rather than the full note hash or nullifier arrays) so that the circuit size
    // can be optimized according to the number of squashable pairs needed.
    //
    let mut should_skip_hint = false;
    for i in 0..NUM_INDEX_HINTS {
        let hint = transient_data_index_hints[i];
        let nullifier_index_hint_sorted_tuple = nullifier_index_hint_sorted_tuples[i];

        // === Determine if the hint should be skipped ===
        // Only the first `num_squashed_note_hash_nullifier_pairs` hints are used to squash note hashes and nullifiers.
        //
        // Each of theses active hints must be unique.
        // This prevents having two identical hints that point to the same note hashes or nullifiers, which will
        // make the `num_squashed_note_hash_nullifier_pairs` more than the actual items being squashed. This will allow
        // skipping propagating a note hash or nullifier.
        should_skip_hint |= i == num_squashed_note_hash_nullifier_pairs;

        if should_skip_hint {
            // Ensure each inactive hint has the nullifier index that is out of bounds for the nullifiers array.
            // Without this check, the sorted tuple can point to a hint that is not used to squash a note hash and
            // nullifier,
            assert_eq(hint.nullifier_index, NUM_NULLIFIERS);
            assert_eq(nullifier_index_hint_sorted_tuple.elem, NUM_NULLIFIERS);
            // Note: We don't need to check that the `note_hash_index` is out of bounds. We can make sure the first
            // `num_squashed_note_hash_nullifier_pairs` note hash indices are unique by checking that they are in
            // increasing order.
        } else {
            // We have a hint that points to a (note, nullifier) pair that can be squashed.
            let nullifier = nullifiers.array[hint.nullifier_index];
            let note_hash = note_hashes.array[hint.note_hash_index];

            // === Ensure the transient_data_index_hint is unique ===

            // Ensure each `note_hash_index` is unique by checking that they are in increasing order.
            if i != 0 {
                assert(
                    hint.note_hash_index > transient_data_index_hints[i - 1].note_hash_index,
                    "Note hash index hint is not in increasing order",
                );
            }

            // Ensure each `nullifier_index` is unique.
            // Unlike the `note_hash_index`, the `nullifier_index` is not sorted.
            // So we take a sorted array `nullifier_index_hint_sorted_tuple` as hint, and check that there exists a
            // `nullifier_index` in `transient_data_index_hints` that matches the hint. We then check that the values in
            // the sorted tuples are in increasing order.
            assert_eq(
                nullifier_index_hint_sorted_tuple.elem,
                transient_data_index_hints[nullifier_index_hint_sorted_tuple.original_index]
                    .nullifier_index,
            );
            if i != 0 {
                assert(
                    nullifier_index_hint_sorted_tuple.elem
                        > nullifier_index_hint_sorted_tuples[i - 1].elem,
                    "Nullifier sorted tuple hint is not in increasing order",
                );
            }

            // === Ensure the indices are within the claimed lengths ===

            // Check that the hinted indexes are within the claimed lengths of the note hash and nullifier arrays.
            // This prevents malicious users from faking a note hash or nullifier beyond the claimed length to justify
            // squashing a nullifier or note hash that should not be squashed.
            assert(
                hint.nullifier_index < nullifiers.length,
                "Nullifier index hint exceeds claimed length",
            );
            // TODO: Check this only once.
            assert(
                hint.note_hash_index < note_hashes.length,
                "Note hash index hint exceeds claimed length",
            );

            // === Ensure the nullifier can nullify the note hash ===

            // Ensure the nullifier refers to the note hash.
            assert_eq(
                note_hash.value(),
                nullifier.nullified_note_hash(),
                "Value of the hinted transient note hash does not match",
            );

            // Ensure the note hash and nullifier are from the same contract.
            assert_eq(
                note_hash.contract_address,
                nullifier.contract_address,
                "Contract address of the hinted transient note hash does not match",
            );

            // Ensure the nullifier is created after the note hash it nullifies.
            assert(
                nullifier.counter() > note_hash.counter(),
                "Cannot nullify a note hash created afterwards",
            );

            // If the nullifier is revertible (i.e., counter >= min_revertible_side_effect_counter), the note hash must
            // also be revertible.
            //
            // A revertible nullifier and non-revertible note hash pair can't be squashed; they must be propagated.
            // That is because, if the transaction reverts, the non-revertible note hash will be kept, and the
            // revertible nullifier will be discarded. If we squash the pair, we would lose the non-revertible note hash
            // that is no longer nullified when the transaction reverts.
            //
            // Note: No need to check the other way around. Since the nullifier counter must be larger than the note
            // hash counter, it's not possible to have a non-revertible nullifier nullifying a revertible note hash.
            if nullifier.counter() >= min_revertible_side_effect_counter {
                assert(
                    note_hash.counter() >= min_revertible_side_effect_counter,
                    "Cannot squash a non-revertible note hash with a revertible nullifier",
                );
            }

            // === Validate the flags `is_squashed...hints` are correctly set ===
            // They are used later to check that the kept note hashes and nullifiers are correctly propagated.
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

    // === Validate the expected kept note hashes ===
    // Iterate over the `is_squashed_note_hash_hints` and check that the non-squashed note hashes are propagated
    // correctly.
    // Earlier we ensured that a note hash's corresponding flag in `is_squashed_note_hash_hints` is set to `true` when
    // it is squashed. Here we propagate the note hashes whose flags are `false`, and check that they match the expected
    // kept note hashes.
    let mut kept_note_hashes_counter = 0;
    for i in 0..NUM_NOTE_HASHES {
        if !is_squashed_note_hash_hints[i] {
            assert_eq(
                expected_kept_note_hashes.array[kept_note_hashes_counter],
                note_hashes.array[i],
                "Propagated note hash does not match",
            );
            kept_note_hashes_counter += 1;
        }
    }
    // If a flag is set to `true` for a note hash that is not squashed, the `kept_note_hashes_counter` will be smaller
    // than it should be, and the below check will fail.
    assert_eq(
        kept_note_hashes_counter + num_squashed_note_hash_nullifier_pairs,
        NUM_NOTE_HASHES,
        "Wrong number of note hashes removed",
    );
    // Ensure that the length of the kept note hashes array is correct.
    assert_eq(
        expected_kept_note_hashes.length,
        note_hashes.length - num_squashed_note_hash_nullifier_pairs,
        "Length of expected kept note hashes array is incorrect",
    );

    // === Validate the expected kept nullifiers ===
    // Iterate over the `is_squashed_nullifier_hints` and check that the non-squashed nullifiers are propagated
    // correctly.
    // Earlier we ensured that a nullifier's corresponding flag in `is_squashed_nullifier_hints` is set to `true` when
    // it is squashed. Here we propagate the nullifiers whose flags are `false`, and check that they match the expected
    // kept nullifiers.
    let mut kept_nullifiers_counter = 0;
    for i in 0..NUM_NULLIFIERS {
        if !is_squashed_nullifier_hints[i] {
            assert_eq(
                expected_kept_nullifiers.array[kept_nullifiers_counter],
                nullifiers.array[i],
                "Propagated nullifier does not match",
            );
            kept_nullifiers_counter += 1;
        }
    }
    // If a flag is set to `true` for a nullifier that is not squashed, the `kept_nullifiers_counter` will be smaller
    // than it should be, and the below check will fail.
    assert_eq(
        expected_kept_nullifiers.length,
        nullifiers.length - num_squashed_note_hash_nullifier_pairs,
        "Length of expected kept nullifiers array is incorrect",
    );
    // Ensure that the number of kept nullifiers array is correct.
    assert_eq(
        kept_nullifiers_counter + num_squashed_note_hash_nullifier_pairs,
        NUM_NULLIFIERS,
        "Wrong number of nullifiers removed",
    );

    // =============
    // Log Squashing
    // =============
    //
    // This loop determines whether each log should be:
    // - kept and propagated forward, or
    // - squashed along with its associated note hash.
    //
    // The decision is based on whether the log is a note log and whether it's correctly linked
    // to a note hash that has been either kept or squashed.
    //
    let mut kept_logs_counter = 0;
    for i in 0..NUM_LOGS {
        let log = logs.array[i];
        let note_log_hint = note_log_hints[i];

        // A log is considered a "note log" if its `note_hash_counter` is non-zero.
        let is_note_log = log.inner.note_hash_counter != 0;

        // === Read the hinted data ===
        // If the log is squashed, it should be linked to the note hash at this index.
        let squashed_note_hash_index = transient_data_index_hints[note_log_hint
            .transient_data_index_hint_index]
            .note_hash_index;
        // If the log is kept, it should be linked to this note hash.
        let kept_note_hash_index = note_log_hint.kept_note_hash_index;
        let hinted_kept_note_hash = expected_kept_note_hashes.array[kept_note_hash_index];
        // The expected output if the log is kept.
        let expected_kept_log = expected_kept_logs.array[kept_logs_counter];

        // === Determine if the log should be kept ===
        // A log will be kept if:
        // - it is note a note log, OR
        // - it is linked to a kept note hash.
        let is_kept = !is_note_log | is_log_linked_to_note_hash(log, hinted_kept_note_hash);

        if is_kept {
            if is_note_log {
                // Check that the index used to get `hinted_kept_note_hash` is within the claimed length of the
                // `expected_kept_note_hashes` array.
                // This prevents malicious users from faking a note hash beyond the claimed length to justify keeping a
                // log that should be squashed.
                assert(
                    kept_note_hash_index < expected_kept_note_hashes.length,
                    "Kept note hash index exceeds claimed length",
                );
            }

            // Ensure the log is propagated correctly.
            assert_eq(log, expected_kept_log, "Propagated private log does not match");

            // We've encountered a log that is kept. Increment the counter by 1.
            kept_logs_counter += 1;
        } else {
            // Ensure the log is associated with a squashed note hash.
            // Note: `hinted_squashed_note_hash` can't be defined outside the `else` block like everything else, because
            // `squashed_note_hash_index` might be out of bounds for a kept log. It's only in this `else` block that we
            // know it must point to a valid entry in `note_hashes`.
            let hinted_squashed_note_hash = note_hashes.array[squashed_note_hash_index];
            assert(
                is_log_linked_to_note_hash(log, hinted_squashed_note_hash),
                "Log does not link to the hinted squashed note hash",
            );
            // We can be sure that `hinted_squashed_note_hash` is squashed because its index appears in
            // `transient_data_index_hints`, which is iterated over earlier. And each `note_hash_index` in it that
            // doesn't overflow the note hashes array is used to squash a note_hash, nullifier pair.
            //
            // No need to check that `squashed_note_hash_index` is within the claimed length; that check is already
            // done when the hint is used to squash the note hash.

            // === Log and squashed note hash must both be revertible or non-revertible ===
            // If the squashed note hash is revertible (i.e., counter >= min_revertible_side_effect_counter), the log
            // must also be revertible.
            // If the squashed note hash is non-revertible, the log must be non-revertible.
            //
            // If a non-revertible log is linked to a revertible note hash, and vice versa, both the note hash and the
            // log must be kept.
            // Because if the transaction reverts, the non-revertible data will be kept, and the revertible data will be
            // discarded. Squashing them together would result in the loss of the non-revertible log or note hash that
            // is supposed to be preserved when the transaction reverts.
            //
            // While it is unlikely that an app would want to retain a log linked to a discarded note hash, or discard
            // a log while its note hash is kept, it is still a valid scenario that must be handled.
            let is_note_hash_revertible =
                hinted_squashed_note_hash.counter() >= min_revertible_side_effect_counter;
            let is_log_revertible = log.counter() >= min_revertible_side_effect_counter;
            assert_eq(
                is_note_hash_revertible,
                is_log_revertible,
                "Cannot squash a note hash and log across the revertible/non-revertible boundaries",
            );
        }
    }

    // === Validate the kept logs array length ===
    // Note: We can't directly compare `expected_kept_logs.length` with `kept_logs_counter`, because the counter
    // includes logs beyond the claimed length.
    // Instead, we calculate how many logs were squashed, and derive the expected kept array length.
    let num_squashed_logs = NUM_LOGS - kept_logs_counter;
    assert_eq(
        expected_kept_logs.length,
        logs.length - num_squashed_logs,
        "Length of expected kept logs array is incorrect",
    );
}

mod tests {
    use crate::reset::transient_data::{
        DerivedHints, get_derived_hints, TransientDataIndexHint, verify_squashed_transient_data,
        verify_squashed_transient_data_with_derived_hints,
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
        tests::utils::{pad_end, pad_end_with_empty},
        traits::{Empty, FromField},
        utils::arrays::{ClaimedLengthArray, find_index_hint},
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
        min_revertible_side_effect_counter: u32,
        transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
    }

    impl TestDataBuilder<5, 4, 6, 3> {
        /// Create a test case with no note hashes, nullifiers, or logs.
        pub fn empty() -> Self {
            Self::from_active_arrays([], [], [], [], [], [], [])
        }

        /// Create a test case where 2 out of 3 note hash and nullifier pairs are squashed.
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

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
            )
        }
    }

    impl TestDataBuilder<4, 4, 4, 3> {
        /// Create a test case where all note hashes and nullifiers are squashed.
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

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
            )
        }
    }

    impl TestDataBuilder<5, 5, 7, 4> {
        /// Create a test case where all the note hashes have the same value.
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
            ];

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
            )
        }
    }

    impl TestDataBuilder<5, 4, 6, 2> {
        /// Create a test case where more than 1 log is linked to the same note hash.
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

            Self::from_active_arrays(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                expected_kept_nullifiers,
                expected_kept_logs,
                transient_data_index_hints,
            )
        }
    }

    impl<let NUM_NOTE_HASHES: u32, let NUM_NULLIFIERS: u32, let NUM_LOGS: u32, let NUM_INDEX_HINTS: u32> TestDataBuilder<NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS, NUM_INDEX_HINTS> {
        pub fn from_active_arrays<let N: u32, let M: u32, let P: u32, let Q: u32, let R: u32, let S: u32, let T: u32>(
            note_hashes: [ScopedNoteHash; N],
            nullifiers: [ScopedNullifier; M],
            logs: [Scoped<PrivateLogData>; P],
            expected_kept_note_hashes: [ScopedNoteHash; Q],
            expected_kept_nullifiers: [ScopedNullifier; R],
            expected_kept_logs: [Scoped<PrivateLogData>; S],
            transient_data_index_hints: [TransientDataIndexHint; T],
        ) -> Self {
            TestDataBuilder {
                note_hashes: ClaimedLengthArray {
                    array: pad_end_with_empty(note_hashes),
                    length: note_hashes.len(),
                },
                nullifiers: ClaimedLengthArray {
                    array: pad_end_with_empty(nullifiers),
                    length: nullifiers.len(),
                },
                logs: ClaimedLengthArray { array: pad_end_with_empty(logs), length: logs.len() },
                expected_kept_note_hashes: ClaimedLengthArray {
                    array: pad_end_with_empty(expected_kept_note_hashes),
                    length: expected_kept_note_hashes.len(),
                },
                expected_kept_nullifiers: ClaimedLengthArray {
                    array: pad_end_with_empty(expected_kept_nullifiers),
                    length: expected_kept_nullifiers.len(),
                },
                expected_kept_logs: ClaimedLengthArray {
                    array: pad_end_with_empty(expected_kept_logs),
                    length: expected_kept_logs.len(),
                },
                min_revertible_side_effect_counter: 0,
                transient_data_index_hints: pad_end(
                    transient_data_index_hints,
                    TransientDataIndexHint::skip(NUM_NULLIFIERS, NUM_NOTE_HASHES),
                ),
            }
        }

        pub fn add_note_hashes<let N: u32>(&mut self, note_hashes: [NoteHash; N]) {
            for i in 0..N {
                self.note_hashes.push(note_hashes[i].scope(contract_address));
            }
        }

        pub fn add_nullifiers<let N: u32>(&mut self, nullifiers: [Nullifier; N]) {
            for i in 0..N {
                self.nullifiers.push(nullifiers[i].scope(contract_address));
            }
        }

        pub fn squash(&mut self, note_hash_index: u32, nullifier_index: u32) {
            // Find the index of the first "skip" hint.
            // Safety: This is only used in tests.
            let transient_data_index_hint_index = unsafe {
                find_index_hint(
                    self.transient_data_index_hints,
                    |hint| hint.note_hash_index == NUM_NOTE_HASHES,
                )
                    .unwrap()
            };
            // Update the hint to squash the pair.
            self.transient_data_index_hints[transient_data_index_hint_index] =
                TransientDataIndexHint { nullifier_index, note_hash_index };
        }

        pub fn keep_note_hashes<let N: u32>(&mut self, note_hash_indices: [u32; N]) {
            for i in 0..N {
                self.expected_kept_note_hashes.push(self.note_hashes.array[note_hash_indices[i]]);
            }
        }

        pub fn keep_nullifiers<let N: u32>(&mut self, nullifier_indices: [u32; N]) {
            for i in 0..N {
                self.expected_kept_nullifiers.push(self.nullifiers.array[nullifier_indices[i]]);
            }
        }

        pub fn get_skip_index_hint(_self: Self) -> TransientDataIndexHint {
            TransientDataIndexHint::skip(NUM_NULLIFIERS, NUM_NOTE_HASHES)
        }

        pub fn get_derived_hints(
            self,
        ) -> DerivedHints<NUM_INDEX_HINTS, NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS> {
            // Safety: This is only used in tests.
            unsafe {
                get_derived_hints(
                    self.transient_data_index_hints,
                    self.note_hashes,
                    self.expected_kept_note_hashes,
                    self.logs,
                )
            }
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
                self.min_revertible_side_effect_counter,
            );
        }

        pub fn verify_with_derived_hints(
            self,
            derived_hints: DerivedHints<NUM_INDEX_HINTS, NUM_NOTE_HASHES, NUM_NULLIFIERS, NUM_LOGS>,
        ) {
            verify_squashed_transient_data_with_derived_hints(
                self.note_hashes,
                self.nullifiers,
                self.logs,
                self.expected_kept_note_hashes,
                self.expected_kept_nullifiers,
                self.expected_kept_logs,
                self.min_revertible_side_effect_counter,
                self.transient_data_index_hints,
                derived_hints,
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
    fn succeeds_empty() {
        TestDataBuilder::empty().verify();
    }

    #[test]
    fn succeeds_propagate_squashable_pairs() {
        let mut builder = TestDataBuilder::new_clear_all();

        // Keep the nullifier at index 0 and the note hash at index 2.
        let removed_hint = builder.transient_data_index_hints[0];
        assert_eq(removed_hint.nullifier_index, 0);
        assert_eq(removed_hint.note_hash_index, 2);

        // Update the hint to skip squashing.
        builder.transient_data_index_hints[0] = builder.get_skip_index_hint();

        // Propagate the values.
        builder.expected_kept_note_hashes.push(
            builder.note_hashes.array[removed_hint.note_hash_index],
        );
        builder.expected_kept_nullifiers.push(
            builder.nullifiers.array[removed_hint.nullifier_index],
        );
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
        builder.min_revertible_side_effect_counter = note_hash_counter + 1;

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

        // Get the hints before the data is modified..
        let derived_hints = builder.get_derived_hints();

        // Change the counter of a kept note hash.
        builder.expected_kept_note_hashes.array[0].note_hash.counter += 1;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Wrong squashed note hash hint")]
    fn fails_wrong_note_hash_squashed_hint() {
        let builder = TestDataBuilder::new_clear_all();

        let mut derived_hints = builder.get_derived_hints();

        derived_hints.is_squashed_note_hash_hints[0] = false;

        builder.verify_with_derived_hints(derived_hints);
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

        let mut derived_hints = builder.get_derived_hints();
        // Set the hint to false so it's assumed the note hash has not been squashed.
        derived_hints.is_squashed_note_hash_hints[1] = false;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Wrong number of note hashes removed")]
    fn fails_identical_note_hashes_nullify_same_note_hash() {
        let mut builder = TestDataBuilder::new_identical_note_hashes();
        let mut derived_hints = builder.get_derived_hints();

        assert_eq(builder.transient_data_index_hints[1].note_hash_index, 1);
        // Make the nullifier at index 2 to also nullify the note hash at index 0.
        builder.transient_data_index_hints[1].note_hash_index = 0;
        // Propagate the note hashes at index 1 and 2.
        builder.expected_kept_note_hashes.array[0] = builder.note_hashes.array[1];
        builder.expected_kept_note_hashes.array[1] = builder.note_hashes.array[2];

        // Set the hint to false so it's assumed the note hash has not been squashed.
        derived_hints.is_squashed_note_hash_hints[1] = false;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Wrong number of note hashes removed")]
    fn fails_note_hash_not_propagated() {
        let mut builder = TestDataBuilder::new();
        let mut derived_hints = builder.get_derived_hints();

        // Do not propagate any note hashes.
        builder.expected_kept_note_hashes.array[0] = ScopedNoteHash::empty();

        // Set the hint to true so it's assumed the note hash has been squashed.
        assert_eq(derived_hints.is_squashed_note_hash_hints[1], false);
        derived_hints.is_squashed_note_hash_hints[1] = true;

        builder.verify_with_derived_hints(derived_hints);
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

        let mut derived_hints = builder.get_derived_hints();
        // Set the hint to false so it's assumed the note hash has not been squashed.
        derived_hints.is_squashed_nullifier_hints[1] = false;

        builder.verify_with_derived_hints(derived_hints);
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

        let mut derived_hints = builder.get_derived_hints();
        // Set the hint to true so it's assumed the note hash has been squashed.
        derived_hints.is_squashed_nullifier_hints[2] = true;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test]
    fn fails_two_identical_transient_data_index_hints() {
        let mut builder = TestDataBuilder::empty();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 100 },
            NoteHash { value: 22, counter: 200 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 44, counter: 400, note_hash: 0 },
            Nullifier { value: 55, counter: 500, note_hash: 11 },
        ]);

        builder.squash(0, 1);
        builder.squash(0, 1);

        let mut derived_hints = builder.get_derived_hints();

        // Tweak the hints to mark the note hash and nullifier as squashed.
        derived_hints.is_squashed_note_hash_hints[1] = true;
        derived_hints.is_squashed_nullifier_hints[0] = true;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test]
    fn fails_two_nullifiers_linked_to_same_note_hash() {
        let mut builder = TestDataBuilder::empty();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 100 },
            NoteHash { value: 22, counter: 200 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 44, counter: 400, note_hash: 11 },
            Nullifier { value: 55, counter: 500, note_hash: 11 },
        ]);

        builder.squash(0, 0);
        builder.squash(0, 1);

        let mut derived_hints = builder.get_derived_hints();

        // Tweak the hints to mark the note hash and nullifier as squashed.
        derived_hints.is_squashed_note_hash_hints[1] = true;
        derived_hints.is_squashed_nullifier_hints[0] = true;

        builder.verify_with_derived_hints(derived_hints);
    }

    #[test]
    fn fails_two_note_hashes_linked_to_same_nullifier() {
        let mut builder = TestDataBuilder::empty();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 100 },
            NoteHash { value: 11, counter: 200 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 44, counter: 400, note_hash: 11 },
            Nullifier { value: 55, counter: 500, note_hash: 22 },
        ]);

        builder.squash(0, 0);
        builder.squash(1, 0);

        let mut derived_hints = builder.get_derived_hints();

        // Tweak the hints to mark the note hash and nullifier as squashed.
        derived_hints.is_squashed_nullifier_hints[1] = true;

        builder.verify_with_derived_hints(derived_hints);
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

        // // Update the hint to point to the fake note hash index.
        // builder.note_log_hints[fake_log_index] = NoteLogHint::as_kept(fake_kept_note_hash_index);

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

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_mismatch_log_contract_address() {
        let mut builder = TestDataBuilder::new();

        // Change the contract address of the log linked to a squashed note hash.
        builder.logs.array[0].contract_address.inner += 1;

        builder.verify();
    }

    // #[test(should_fail_with = "Value of the hinted transient note hash does not match log")]
    // fn fails_wrong_log_note_hash() {
    //     let mut builder = TestDataBuilder::new();

    //     builder.logs.array[0].inner.note_hash_counter += 1;

    //     builder.verify_with_derived_hints();
    // }

    #[test]
    fn succeeds_linking_more_than_one_log_with_same_note_hash() {
        TestDataBuilder::new_identical_linked_note_hash().verify();
    }
}
