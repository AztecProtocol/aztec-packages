use crate::reset::transient_data::{
    derived_hints::NoteLogLinkedSourceIndices,
    transient_data_squashing_hint::TransientDataSquashingHint,
};
use types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    utils::arrays::ClaimedLengthArray,
};

fn is_log_linked_to_note_hash(log: Scoped<PrivateLogData>, note_hash: ScopedNoteHash) -> bool {
    (log.inner.note_hash_counter == note_hash.counter())
        & (log.contract_address == note_hash.contract_address)
}

/// Validates the correctness of private log squashing based on transient squashing hints and expected outputs.
///
/// Each private log in `logs` is either:
/// - **Kept** and propagated to `expected_kept_logs`, or
/// - **Squashed** with a corresponding note hash, pointed to by a squashing hint.
///
/// For note logs (logs linked to note hashes), this function enforces:
/// - Correct linkage between logs and their note hashes.
/// - Correct usage of squashing hints.
/// - Both the log and the note hash must be revertible or non-revertible.
pub fn validate_log_squashing<let LogsLen: u32, let SquashingHintsLen: u32, let NoteHashesLen: u32>(
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    min_revertible_side_effect_counter: u32,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    note_log_linked_source_indices: [NoteLogLinkedSourceIndices; LogsLen],
) {
    // This loop determines whether each log should be:
    // - kept and propagated forward, or
    // - squashed along with its associated note hash.
    let mut kept_logs_counter = 0;
    for i in 0..LogsLen {
        let log = logs.array[i];
        let linked_source_indices = note_log_linked_source_indices[i];

        // A log is considered a "note log" if its `note_hash_counter` is non-zero.
        let is_note_log = log.inner.note_hash_counter != 0;

        // === Read the hinted data ===
        // If the log is squashed, it should be linked to the note hash at this index.
        let squashed_note_hash_index = transient_data_squashing_hints[linked_source_indices
            .transient_data_squashing_hint_index]
            .note_hash_index;
        // If the log is kept, it should be linked to this note hash.
        let hinted_kept_note_hash =
            expected_kept_note_hashes.array[linked_source_indices.kept_note_hash_index];
        // The expected output if the log is kept.
        let expected_kept_log = expected_kept_logs.array[kept_logs_counter];

        // === Determine if the log should be kept ===
        // A log will be kept if:
        // - it is not a note log, OR
        // - it is linked to a kept note hash.
        let is_kept = !is_note_log | is_log_linked_to_note_hash(log, hinted_kept_note_hash);

        if is_kept {
            if is_note_log {
                // Check that the index used to get `hinted_kept_note_hash` is within the claimed length of the
                // `expected_kept_note_hashes` array.
                // This prevents malicious users from faking a note hash beyond the claimed length to justify keeping a
                // log that should be squashed.
                assert(
                    linked_source_indices.kept_note_hash_index < expected_kept_note_hashes.length,
                    "Index of linked kept note hash exceeds claimed length",
                );
            }

            // Ensure the log is propagated correctly.
            assert_eq(log, expected_kept_log, "Propagated private log does not match");

            // We've encountered a log that is kept. Increment the counter by 1.
            kept_logs_counter += 1;
        } else {
            // === Ensure the log is associated with a squashed note hash ===
            let hinted_squashed_note_hash = note_hashes.array[squashed_note_hash_index];
            assert(
                is_log_linked_to_note_hash(log, hinted_squashed_note_hash),
                "Log does not link to the hinted squashed note hash",
            );
            // We can be sure that `hinted_squashed_note_hash` is squashed because its index appears in
            // `transient_data_squashing_hints`, which is iterated over earlier. And each `note_hash_index` beyond
            // `num_active_squashing_hints` is set to `NoteHashesLen` and would overflow the note hashes array.
            //
            // No need to check that `squashed_note_hash_index` is within the claimed length; that check is already
            // done when the hint is used to squash the note hash.
            //
            // Note: `hinted_squashed_note_hash` can't be defined outside the `else` block like everything else, because
            // `squashed_note_hash_index` might be out of bounds for a kept log. It's only in this `else` block that we
            // know it must point to a valid entry in `note_hashes`.

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
                "Cannot squash a note hash and log across the revertible/non-revertible boundary",
            );
        }
    }

    // === Validate the kept logs array length ===
    // Note: We can't directly compare `expected_kept_logs.length` with `kept_logs_counter`, because the counter
    // includes logs beyond the claimed length.
    // Instead, we calculate how many logs were squashed, and derive the expected kept array length.
    let num_squashed_logs = LogsLen - kept_logs_counter;
    assert_eq(
        expected_kept_logs.length,
        logs.length - num_squashed_logs,
        "Length of expected kept logs array is incorrect",
    );
}

mod tests {
    use crate::reset::transient_data::tests::{mock_log, TransientDataFixtureBuilder};
    use types::abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::PrivateLogData};

    // =============
    // Non-note logs
    // =============

    #[test]
    fn succeeds_kept_non_note_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log does not link to a note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_fields() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Tweak the value of the kept log.
        builder.expected_kept_logs.array[0].inner.log.fields[0] += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_fields_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Tweak the length of the kept log fields.
        builder.expected_kept_logs.array[0].inner.log.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Tweak the counter of the kept log.
        builder.expected_kept_logs.array[0].inner.counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_note_hash_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Tweak the note hash counter of the kept log.
        builder.expected_kept_logs.array[0].inner.note_hash_counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Tweak the contract address of the kept log.
        builder.expected_kept_logs.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_keep_log_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 },
            PrivateLogData { log: mock_log(202), counter: 8, note_hash_counter: 0 },
        ]);

        // Change the length of the logs array to 1, to make the log at index 1 beyond the claimed length.
        builder.logs.length = 1;

        // Keep both logs.
        builder.keep_logs([0, 1]);

        builder.validate();
    }

    #[test]
    fn succeeds_ignore_log_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 },
            PrivateLogData { log: mock_log(202), counter: 8, note_hash_counter: 0 },
        ]);

        // Change the length of the logs array to 1, to make the log at index 1 beyond the claimed length.
        builder.logs.length = 1;

        // Keep both logs.
        builder.keep_logs([0, 1]);

        // Change the claimed length of the kept logs array to 1, to ignore the log at index 1.
        builder.expected_kept_logs.length = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_increased_expected_kept_logs_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Increase the claimed length to make the first empty log an active kept log.
        builder.expected_kept_logs.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_decreased_expected_kept_logs_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 0 }]);

        builder.keep_logs([0]);

        // Decrease the claimed length to ignore the kept log.
        builder.expected_kept_logs.length -= 1;

        builder.validate();
    }

    // ==============
    // Kept note logs
    // ==============

    #[test]
    fn succeeds_kept_note_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_logs([0]);

        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_kept_note_log_linked_to_non_existent_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash, but the note hash does not exist.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_logs([0]);

        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_kept_note_log_linked_to_fake_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash beyond the claimed length.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 99, counter: 999 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        builder.keep_logs([0]);

        builder.keep_note_hashes([0, 1]);

        // Change the length of the expected kept note hashes array to 1, to ignore the note hash at index 1.
        builder.expected_kept_note_hashes.length = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_kept_note_log_linked_to_fake_note_hash_with_tweaked_hint_out_of_bounds() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash beyond the claimed length.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 99, counter: 999 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        builder.keep_logs([0]);

        builder.keep_note_hashes([0, 1]);

        // Change the length of the expected kept note hashes array to 1, to ignore the note hash at index 1.
        builder.expected_kept_note_hashes.length = 1;

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to keep the log with the kept note hash at index 1.
        derived_hints.note_log_linked_source_indices[0].kept_note_hash_index = 1;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Index of linked kept note hash exceeds claimed length")]
    fn fails_kept_note_log_linked_to_fake_note_hash_with_tweaked_hint_exceeds_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash beyond the claimed length.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 99, counter: 999 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        builder.keep_logs([0]);

        builder.keep_note_hashes([0, 1]);

        // Change the length of the expected kept note hashes array to 1, to ignore the note hash at index 1.
        builder.expected_kept_note_hashes.length = 1;

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to keep the log with the kept note hash at index 1.
        derived_hints.note_log_linked_source_indices[0].kept_note_hash_index = 1;

        // Change the index of the possible squashing hint to default (0) so that it won't trigger an out of bounds
        // error like in the previous test.
        derived_hints.note_log_linked_source_indices[0].transient_data_squashing_hint_index = 0;

        builder.validate_with_derived_hints(derived_hints);
    }

    // =============
    // Squashed logs
    // =============

    #[test]
    fn succeeds_squashed_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Everything is squashed.

        builder.validate();
    }

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_squashed_log_mismatch_note_hash_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Change the contract address of the log to be different from the note hash.
        builder.logs.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_squashed_log_linked_to_non_existent_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a non-existent note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_squashed_log_mismatch_note_hash_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a non-existent note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to squash the log with the note hash at index 0.
        derived_hints.note_log_linked_source_indices[0].transient_data_squashing_hint_index = 0;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Unused note hash index hint must be set to NoteHashesLen")]
    fn fails_squashed_log_linked_to_fake_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash beyond the claimed length.
        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 999 }]);

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 99, counter: 999 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Propagate the note hash at index 1 to the expected kept note hashes array.
        // But the claimed length of the expected kept note hashes array still remains 0.
        builder.expected_kept_note_hashes.array[0] = builder.note_hashes.array[1];

        // Set the note hash index 1 to an unused squashing hint.
        builder.transient_data_squashing_hints[1].note_hash_index = 1;

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to squash the log with the note hash at index 1.
        derived_hints.note_log_linked_source_indices[0].transient_data_squashing_hint_index = 1;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test]
    fn succeeds_squashed_non_revertible_log_with_non_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 5, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 7, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // All the data is non-revertible.
        builder.min_revertible_side_effect_counter = 10;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a note hash and log across the revertible/non-revertible boundary")]
    fn fails_squashed_non_revertible_log_with_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 5, note_hash_counter: 6 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 6 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 7, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Make the log non-revertible, the note hash and nullifier revertible.
        builder.min_revertible_side_effect_counter = 6;

        builder.validate();
    }

    #[test]
    fn succeeds_squashed_revertible_log_with_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 5, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 7, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // All the data is revertible.
        builder.min_revertible_side_effect_counter = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a note hash and log across the revertible/non-revertible boundary")]
    fn fails_squashed_revertible_log_with_non_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), counter: 10, note_hash_counter: 1 }]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 7, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Make the log revertible, the note hash and nullifier non-revertible.
        builder.min_revertible_side_effect_counter = 10;

        builder.validate();
    }

    #[test]
    fn succeeds_squash_multiple_logs_with_same_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // All the logs are linked to the same note hash.
        builder.add_logs([
            PrivateLogData { log: mock_log(101), counter: 7, note_hash_counter: 1 },
            PrivateLogData { log: mock_log(202), counter: 8, note_hash_counter: 1 },
            PrivateLogData { log: mock_log(303), counter: 9, note_hash_counter: 1 },
        ]);

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Everything is squashed.

        builder.validate();
    }
}
