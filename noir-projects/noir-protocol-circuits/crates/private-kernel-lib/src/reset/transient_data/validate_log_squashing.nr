use crate::reset::transient_data::{
    derived_hints::NoteLogLinkedSourceIndices,
    transient_data_squashing_hint::TransientDataSquashingHint,
};
use types::{
    abis::{note_hash::NoteHash, private_log::PrivateLogData},
    side_effect::{Counted, Ordered, Scoped},
    utils::arrays::ClaimedLengthArray,
};

fn is_log_linked_to_note_hash(
    log: Scoped<Counted<PrivateLogData>>,
    note_hash: Scoped<Counted<NoteHash>>,
) -> bool {
    // Note: a note_hash.counter() cannot be `0`, due to checks in the Init & Inner circuits.
    (log.innermost().note_hash_counter == note_hash.counter())
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
    logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
    note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
    expected_kept_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
    expected_kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
    split_counter: u32,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    note_log_linked_source_indices: [NoteLogLinkedSourceIndices; LogsLen],
) {
    // This loop determines whether each log should be:
    // - kept and propagated forward, or
    // - squashed along with its associated note hash.
    let mut kept_logs_counter = 0;
    // Slots in `[logs.length, LogsLen)` are unconstrained by the previous kernel. A note log planted
    // there could otherwise take the squashed branch below and inflate the implicit squashed-log
    // count, silently dropping a real kept log. Forcing such slots to be "kept"
    // bounds log squashing to within the claimed length, mirroring how the note-hash / nullifier
    // squash is bounded by `num_active_squashing_hints`. This flag flips false once `i == logs.length`.
    let mut within_length = true;
    for i in 0..LogsLen {
        within_length &= i != logs.length;

        let log = logs.array[i];
        let linked_source_indices = note_log_linked_source_indices[i];

        // A log is considered a "note log" if its `note_hash_counter` is non-zero.
        let is_note_log = log.innermost().note_hash_counter != 0;

        // === Read the hinted data ===

        // If the log is squashed, it should be linked to the note hash at this index.
        let squashed_note_hash_index = transient_data_squashing_hints[linked_source_indices
            .transient_data_squashing_hint_index]
            .note_hash_index;
        // If the log is kept and it is a "note log", it should be linked to this note hash.
        // Note: the expected_kept_note_hashes array has already been constrained by the earlier file
        // `validate_note_hash_nullifier_squashing`.
        let expected_kept_note_hash =
            expected_kept_note_hashes.array[linked_source_indices.kept_note_hash_index];
        // The expected output if the log is kept.
        let expected_kept_log = expected_kept_logs.array[kept_logs_counter];

        // === Determine if the log should be kept ===

        // Here, we determine which of the `linked_source_indices` bites: the `transient_data_squashing_hint_index`
        // (which would mean the log is to be squashed) or the `kept_note_hash_index` (which would mean the
        // log is to be kept).
        // A log will be kept if:
        // - it is beyond the claimed length (such slots must never be squashed; see above), OR
        // - it is not a note log, OR
        // - it is a note log which is linked to a _kept_ note hash.
        let is_kept = !within_length
            | !is_note_log
            | is_log_linked_to_note_hash(log, expected_kept_note_hash);

        if is_kept {
            if is_note_log {
                // Check that the index used to get `expected_kept_note_hash` is within the claimed length of the
                // `expected_kept_note_hashes` array.
                // This prevents malicious users from faking a note hash beyond the claimed length to justify keeping a
                // log that should be squashed.
                // Note: if it's not kept (i.e. if it's squashed), we don't care about making this check, because
                // we won't be making use of the `.kept_note_hash_index` kind.
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
            //
            // must also be revertible.
            // If the squashed note hash is non-revertible, the log must be non-revertible.
            //
            // If a non-revertible log is linked to a revertible note hash, and vice versa, both the note hash and the
            // log must be kept.
            // Because if the transaction reverts, the non-revertible data must be kept, and the revertible data must be
            // discarded. Squashing them together would result in the loss of the non-revertible log or note hash that
            // is supposed to be preserved when the transaction reverts.
            //
            // While it is unlikely that an app would want to retain a log linked to a discarded note hash, or discard
            // a log while its note hash is kept, it is still a valid scenario that must be handled.
            let is_note_hash_revertible = hinted_squashed_note_hash.counter() > split_counter;
            let is_log_revertible = log.counter() > split_counter;
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
    use types::{
        abis::{nullifier::Nullifier, private_log::PrivateLogData},
        address::AztecAddress,
        side_effect::Counted,
        traits::FromField,
    };

    // PoC for kernels-audit #529 (https://github.com/AztecProtocol/aztec-claude/issues/529).
    // `validate_log_squashing` loops over the full physical array
    // `0..LogsLen` (not `logs.length`) and derives `num_squashed_logs = LogsLen - kept_logs_counter`.
    // A planted slot beyond `logs.length` that links to a hint-squashed note hash takes the squashed
    // branch, inflating `num_squashed_logs` by 1 and under-counting `expected_kept_logs.length`,
    // silently dropping a real kept log. The fix forces slots beyond `logs.length` to be "kept", so
    // the planted note log can no longer be squashed and is rejected (regression test).
    #[test(should_fail_with = "Index of linked kept note hash exceeds claimed length")]
    fn poc_529_drop_kept_log_via_planted_slot_beyond_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        // One squashable transient (note, nullifier) pair: note_A at counter 1, squashed by hint (0, 0).
        builder.add_note_hashes([Counted::new(11, 1)]);
        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);
        builder.add_squashing_hint(0, 0);

        // logs[0] = log_A (note log, squashed with note_A); logs[1] = log_B (non-note, MUST be kept).
        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8),
        ]);

        // Claim 0 kept logs, but stage log_B at index 0 so the per-iteration assertion at i=1 passes.
        builder.expected_kept_logs.array[0] = builder.logs.array[1];

        // Plant a fake slot beyond logs.length (= 2) whose note_hash_counter matches squashed note_A.
        builder.logs.array[2] = PrivateLogData { log: mock_log(999), note_hash_counter: 1 }
            .count(42)
            .scope(AztecAddress::from_field(987654));

        builder.validate();
    }

    // =============
    // Non-note logs
    // =============

    #[test]
    fn succeeds_kept_non_note_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log does not link to a note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_fields() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Tweak the value of the kept log.
        builder.expected_kept_logs.array[0].inner.inner.log.fields[0] += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_fields_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Tweak the length of the kept log fields.
        builder.expected_kept_logs.array[0].inner.inner.log.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Tweak the counter of the kept log.
        builder.expected_kept_logs.array[0].inner.counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_note_hash_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Tweak the note hash counter of the kept log.
        builder.expected_kept_logs.array[0].inner.inner.note_hash_counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_log_wrong_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Tweak the contract address of the kept log.
        builder.expected_kept_logs.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_keep_log_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8),
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
            PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8),
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

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Increase the claimed length to make the first empty log an active kept log.
        builder.expected_kept_logs.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept logs array is incorrect")]
    fn fails_decreased_expected_kept_logs_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        builder.keep_logs([0]);

        // Decrease the claimed length to ignore the kept log.
        builder.expected_kept_logs.length -= 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_non_note_logs_wrong_order() {
        // Attack: Prover provides kept logs in wrong order
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8),
        ]);

        // Keep both logs but in reverse order
        builder.keep_logs([1, 0]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_drop_non_note_log() {
        // Attack: Prover tries to not propagate a non-note log
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8),
        ]);

        // Only keep the first log, dropping the second
        builder.keep_logs([0]);

        builder.validate();
    }

    #[test]
    fn succeeds_zero_zero_hint_for_non_note_log() {
        // Edge case: Verify that {0, 0} hints work correctly for non-note logs
        let mut builder = TransientDataFixtureBuilder::new();

        // Non-note log (note_hash_counter = 0)
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 0 }.count(7)]);

        // Add a note hash and squashing hint at index 0 to create potential confusion
        builder.add_note_hashes([Counted::new(11, 1)]);
        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);
        builder.add_squashing_hint(0, 0);

        // The log should still be kept because it's a non-note log
        builder.keep_logs([0]);

        builder.validate();
    }

    // ==============
    // Kept note logs
    // ==============

    #[test]
    fn succeeds_kept_note_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.keep_logs([0]);

        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_kept_note_log_linked_to_non_existent_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash, but the note hash does not exist.
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.keep_logs([0]);

        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_kept_note_log_linked_to_fake_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a note hash beyond the claimed length.
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(99, 999)]);

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
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(99, 999)]);

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
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(99, 999)]);

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

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_kept_note_log_not_propagated() {
        // Attack: Note log should be kept (its note hash is kept) but prover doesn't propagate it
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.keep_note_hashes([0]);

        // Don't keep the log even though its note hash is kept

        builder.validate();
    }

    #[test]
    fn succeeds_note_log_kept_while_different_note_hash_squashed() {
        // Scenario: One note hash is squashed, another is kept, log links to kept one
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 2 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        // Squash note_hash[0]
        builder.add_squashing_hint(0, 0);

        // Keep note_hash[1]
        builder.keep_note_hashes([1]);

        // Keep the log (linked to note_hash[1])
        builder.keep_logs([0]);

        builder.validate();
    }

    #[test]
    fn succeeds_zero_zero_hint_for_note_log_linked_to_kept_at_index_zero() {
        // Edge case: Note log correctly linked to kept note hash at index 0
        // The default {0, 0} hint should correctly identify this as kept
        let mut builder = TransientDataFixtureBuilder::new();

        // Note log linked to counter=1
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        // Note hash at index 0 with counter=1
        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.keep_note_hashes([0]);
        builder.keep_logs([0]);

        builder.validate();
    }

    // =============
    // Squashed logs
    // =============

    #[test]
    fn succeeds_squashed_log() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Everything is squashed.

        builder.validate();
    }

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_squashed_log_mismatch_note_hash_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Change the contract address of the log to be different from the note hash.
        builder.logs.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Index out of bounds")]
    fn fails_squashed_log_linked_to_non_existent_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a non-existent note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_squashed_log_mismatch_note_hash_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        // This log is linked to a non-existent note hash.
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

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
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 999 }.count(7)]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(99, 999)]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

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

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(5)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(7)]);

        builder.add_squashing_hint(0, 0);

        // All the data is non-revertible.
        builder.split_counter = 10;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a note hash and log across the revertible/non-revertible boundary")]
    fn fails_squashed_non_revertible_log_with_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 7 }.count(5)]);

        builder.add_note_hashes([Counted::new(11, 7)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(8)]);

        builder.add_squashing_hint(0, 0);

        // Make the log non-revertible, the note hash and nullifier revertible.
        builder.split_counter = 6;

        builder.validate();
    }

    #[test]
    fn succeeds_squashed_revertible_log_with_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 2 }.count(5)]);

        builder.add_note_hashes([Counted::new(11, 2)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(7)]);

        builder.add_squashing_hint(0, 0);

        // All the data is revertible.
        builder.split_counter = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a note hash and log across the revertible/non-revertible boundary")]
    fn fails_squashed_revertible_log_with_non_revertible_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(13)]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(7)]);

        builder.add_squashing_hint(0, 0);

        // Make the log revertible, the note hash and nullifier non-revertible.
        builder.split_counter = 10;

        builder.validate();
    }

    #[test]
    fn succeeds_squash_multiple_logs_with_same_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        // All the logs are linked to the same note hash.
        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 1 }.count(8),
            PrivateLogData { log: mock_log(303), note_hash_counter: 1 }.count(9),
        ]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Everything is squashed.

        builder.validate();
    }

    #[test(should_fail_with = "Log does not link to the hinted squashed note hash")]
    fn fails_squashed_log_wrong_squashing_hint_index() {
        // Attack: Prover provides transient_data_squashing_hint_index pointing to
        // a squashing hint that references a different note hash.
        let mut builder = TransientDataFixtureBuilder::new();

        // Two logs linked to different note hashes
        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 2 }.count(8),
        ]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2)]);

        builder.add_nullifiers([
            Nullifier { value: 505, note_hash: 11 }.count(5),
            Nullifier { value: 606, note_hash: 22 }.count(6),
        ]);

        // Squash both
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(1, 1);

        let mut derived_hints = builder.build_derived_hints();

        // Attack: Make log[0] point to squashing_hint[1] (which has note_hash_index=1, counter=2)
        // but log[0] has note_hash_counter=1, so the check will fail.
        derived_hints.note_log_linked_source_indices[0].transient_data_squashing_hint_index = 1;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test]
    fn succeeds_zero_zero_hint_for_note_log_linked_to_squashed_at_index_zero() {
        // Edge case: Note log correctly linked to squashed note hash via squashing hint at index 0
        // The default {0, 0} hint should correctly identify this as squashed
        let mut builder = TransientDataFixtureBuilder::new();

        // Note log linked to counter=1
        builder.add_logs([PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7)]);

        // Note hash at index 0 with counter=1, will be squashed
        builder.add_note_hashes([Counted::new(11, 1)]);
        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Log should be squashed along with note hash (no keep_logs call)

        builder.validate();
    }

    // ==============
    // Mixed scenarios
    // ==============

    #[test]
    fn succeeds_multiple_logs_different_fates() {
        // Scenario: Mix of kept and squashed logs
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7), // will be squashed
            PrivateLogData { log: mock_log(202), note_hash_counter: 2 }.count(8), // will be kept
            PrivateLogData { log: mock_log(303), note_hash_counter: 0 }.count(9), // non-note, kept
            PrivateLogData { log: mock_log(404), note_hash_counter: 1 }.count(10), // will be squashed (same note hash)
        ]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        // Squash note_hash[0] (counter=1)
        builder.add_squashing_hint(0, 0);

        // Keep note_hash[1] (counter=2)
        builder.keep_note_hashes([1]);

        // Logs at index 1 and 2 should be kept (in order)
        builder.keep_logs([1, 2]);

        builder.validate();
    }

    #[test]
    fn succeeds_interleaved_kept_and_squashed_logs() {
        // Scenario: Logs alternate between kept and squashed
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7), // squashed
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8), // kept (non-note)
            PrivateLogData { log: mock_log(303), note_hash_counter: 2 }.count(9), // squashed
            PrivateLogData { log: mock_log(404), note_hash_counter: 3 }.count(10), // kept (note log)
        ]);

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2), Counted::new(33, 3)]);

        builder.add_nullifiers([
            Nullifier { value: 505, note_hash: 11 }.count(5),
            Nullifier { value: 606, note_hash: 22 }.count(6),
        ]);

        // Squash note_hash[0] and note_hash[1]
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(1, 1);

        // Keep note_hash[2]
        builder.keep_note_hashes([2]);

        // Logs at index 1 and 3 should be kept (in order)
        builder.keep_logs([1, 3]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated private log does not match")]
    fn fails_mixed_logs_wrong_order() {
        // Attack: Kept logs provided in wrong order when some logs are squashed
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(7), // squashed
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(8), // kept
            PrivateLogData { log: mock_log(303), note_hash_counter: 0 }.count(9), // kept
        ]);

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Keep logs at index 1 and 2 but in wrong order
        builder.keep_logs([2, 1]);

        builder.validate();
    }
}
