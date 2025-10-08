use super::{
    derived_hints::{build_derived_hints, DerivedHints},
    transient_data_squashing_hint::TransientDataSquashingHint,
    validate_log_squashing::validate_log_squashing,
    validate_note_hash_nullifier_squashing::validate_note_hash_nullifier_squashing,
    validate_transient_data_squashing_hints::validate_transient_data_squashing_hints,
};
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash, nullifier::ScopedNullifier, private_log::PrivateLogData,
        side_effect::scoped::Scoped,
    },
    utils::arrays::ClaimedLengthArray,
};

/// Verifies the correctness of transient data squashing.
///
/// This function checks that note hashes, nullifiers, and logs are squashed correctly according to user-provided hints
/// and expectations. It allows some transient data to be intentionally preserved across iterations when needed.
pub fn validate_squashed_transient_data<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    min_revertible_side_effect_counter: u32,
    // Hints provided by the user to specify what to squash.
    // These are not derived automatically in this function like other hints, because the user can choose to not squash
    // a pair even if it's squashable. Sometimes the transient data might be useful in later iterations. For example, a
    // note hash must be kept to be used for a note hash read request created in a later iteration, and can only be
    // squashed after the read request is validated.
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
) {
    // Safety: The hints are verified below by validate_squashed_transient_data_with_derived_hints.
    let derived_hints = unsafe {
        build_derived_hints(
            note_hashes,
            nullifiers,
            logs,
            expected_kept_note_hashes,
            transient_data_squashing_hints,
        )
    };

    validate_squashed_transient_data_with_derived_hints(
        note_hashes,
        nullifiers,
        logs,
        expected_kept_note_hashes,
        expected_kept_nullifiers,
        expected_kept_logs,
        min_revertible_side_effect_counter,
        transient_data_squashing_hints,
        derived_hints,
    );
}

/// Validates that squashable transient data was correctly removed based on both user hints and derived hints.
///
/// This function checks three major things:
/// - Squashing hints are well-formed: active hints must reference unique and in-bounds note hash and nullifier indices.
/// - Note hashes and nullifiers are squashed or kept appropriately.
/// - Private logs are squashed or propagated, and note logs are correctly linked to the note hashes.
pub fn validate_squashed_transient_data_with_derived_hints<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    min_revertible_side_effect_counter: u32,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    derived_hints: DerivedHints<SquashingHintsLen, NoteHashesLen, NullifiersLen, LogsLen>,
) {
    validate_transient_data_squashing_hints(
        note_hashes,
        nullifiers,
        transient_data_squashing_hints,
        derived_hints.num_active_squashing_hints,
        derived_hints.nullifier_index_sorted_tuples,
    );

    validate_note_hash_nullifier_squashing(
        note_hashes,
        nullifiers,
        expected_kept_note_hashes,
        expected_kept_nullifiers,
        min_revertible_side_effect_counter,
        transient_data_squashing_hints,
        derived_hints.num_active_squashing_hints,
        derived_hints.note_hash_squash_flags,
        derived_hints.nullifier_squash_flags,
    );

    validate_log_squashing(
        logs,
        note_hashes,
        expected_kept_logs,
        expected_kept_note_hashes,
        min_revertible_side_effect_counter,
        transient_data_squashing_hints,
        derived_hints.note_log_linked_source_indices,
    );
}

pub(crate) mod tests {
    use crate::reset::transient_data::tests::{mock_log, TransientDataFixtureBuilder};
    use dep::types::abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::PrivateLogData};

    #[test]
    fn succeeds_empty_everything() {
        TransientDataFixtureBuilder::new().validate();
    }

    #[test]
    fn succeeds_squash_all() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
            NoteHash { value: 33, counter: 3 },
            NoteHash { value: 44, counter: 4 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 55, counter: 5, note_hash: 33 },
            Nullifier { value: 66, counter: 6, note_hash: 11 },
            Nullifier { value: 77, counter: 7, note_hash: 22 },
            Nullifier { value: 88, counter: 8, note_hash: 44 },
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 9, note_hash_counter: 1 },
            PrivateLogData { log: mock_log(202), counter: 10, note_hash_counter: 4 },
            PrivateLogData { log: mock_log(303), counter: 11, note_hash_counter: 1 },
        ]);

        builder.add_squashing_hint(0, 1);
        builder.add_squashing_hint(1, 2);
        builder.add_squashing_hint(2, 0);
        builder.add_squashing_hint(3, 3);

        // Everything is squashed. Nothing is kept.

        builder.validate();
    }

    #[test]
    fn succeeds_keep_squashable_pairs() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 606, counter: 6, note_hash: 22 },
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 2 },
            PrivateLogData { log: mock_log(202), counter: 8, note_hash_counter: 1 },
        ]);

        // All items are kept, even though all the note hashes and nullifiers can be squashed.
        builder.keep_note_hashes([0, 1]);
        builder.keep_nullifiers([0, 1]);
        builder.keep_logs([0, 1]);

        builder.validate();
    }

    #[test]
    fn succeeds_squash_partial() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 22 },
            Nullifier { value: 606, counter: 6, note_hash: 99 },
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 2 },
            PrivateLogData { log: mock_log(202), counter: 8, note_hash_counter: 1 },
        ]);

        builder.add_squashing_hint(1, 0);

        // note_hashes[0] and nullifiers[1] are not squashable and are kept.
        builder.keep_note_hashes([0]);
        builder.keep_nullifiers([1]);
        // logs[1] is linked to note_hashes[0] and is kept.
        builder.keep_logs([1]);

        builder.validate();
    }

    #[test]
    fn succeeds_full_arrays_keep_all() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
            NoteHash { value: 33, counter: 3 },
            NoteHash { value: 44, counter: 4 },
            NoteHash { value: 55, counter: 5 },
            NoteHash { value: 66, counter: 6 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 10, counter: 7, note_hash: 33 },
            Nullifier { value: 20, counter: 8, note_hash: 0 },
            Nullifier { value: 30, counter: 9, note_hash: 0 },
            Nullifier { value: 40, counter: 10, note_hash: 11 },
            Nullifier { value: 50, counter: 11, note_hash: 66 },
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 12, note_hash_counter: 5 },
            PrivateLogData { log: mock_log(202), counter: 13, note_hash_counter: 0 },
            PrivateLogData { log: mock_log(303), counter: 14, note_hash_counter: 1 },
            PrivateLogData { log: mock_log(404), counter: 15, note_hash_counter: 1 },
            PrivateLogData { log: mock_log(505), counter: 16, note_hash_counter: 6 },
            PrivateLogData { log: mock_log(606), counter: 17, note_hash_counter: 0 },
            PrivateLogData { log: mock_log(707), counter: 18, note_hash_counter: 1 },
        ]);

        builder.keep_note_hashes([0, 1, 2, 3, 4, 5]);
        builder.keep_nullifiers([0, 1, 2, 3, 4]);
        builder.keep_logs([0, 1, 2, 3, 4, 5, 6]);

        builder.validate();
    }

    #[test]
    fn succeeds_identical_note_hashes() {
        let mut builder = TransientDataFixtureBuilder::new();

        // All the note hashes have the same value.
        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 11, counter: 2 },
            NoteHash { value: 11, counter: 3 },
        ]);

        // All the nullifiers nullify the same note hash value.
        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
            Nullifier { value: 707, counter: 7, note_hash: 11 },
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 8, note_hash_counter: 2 },
            PrivateLogData { log: mock_log(202), counter: 9, note_hash_counter: 3 },
            PrivateLogData { log: mock_log(303), counter: 10, note_hash_counter: 1 },
        ]);

        // Use the hint to specify which note hash and nullifier to be paired and squashed.
        builder.add_squashing_hint(0, 1);
        builder.add_squashing_hint(2, 0);

        builder.keep_note_hashes([1]);
        builder.keep_nullifiers([2]);
        builder.keep_logs([0]);

        builder.validate();
    }
}
