use super::{
    derived_hints::{build_derived_hints, DerivedHints},
    transient_data_squashing_hint::TransientDataSquashingHint,
    validate_log_squashing::validate_log_squashing,
    validate_note_hash_nullifier_squashing::validate_note_hash_nullifier_squashing,
    validate_transient_data_squashing_hints::validate_transient_data_squashing_hints,
};
use dep::types::{
    abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::PrivateLogData},
    side_effect::{Counted, Scoped},
    utils::arrays::ClaimedLengthArray,
};

/// Verifies the correctness of transient data squashing.
///
/// This function checks that note hashes, nullifiers, and logs are squashed correctly according to user-provided hints
/// and expectations. It allows some transient data to be intentionally preserved across iterations when needed.
pub struct TransientDataValidator<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32> {
    pub note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
    pub nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>,
    pub logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
    pub expected_kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
    pub expected_kept_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>,
    pub expected_kept_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
    pub min_revertible_side_effect_counter: u32,
    // Hints provided by the user to specify what to squash.
    // These are not derived automatically in this function like other hints, because the user can choose to not squash
    // a pair even if it's squashable. Sometimes the transient data might be useful in later iterations. For example, a
    // note hash must be kept to be used for a note hash read request created in a later iteration, and can only be
    // squashed after the read request is validated.
    pub transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    pub derived_hints: DerivedHints<SquashingHintsLen, NoteHashesLen, NullifiersLen, LogsLen>,
}

impl<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32> TransientDataValidator<NoteHashesLen, NullifiersLen, LogsLen, SquashingHintsLen> {
    pub fn new(
        note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
        nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>,
        logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
        expected_kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, NoteHashesLen>,
        expected_kept_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>,
        expected_kept_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, LogsLen>,
        min_revertible_side_effect_counter: u32,
        transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    ) -> Self {
        // Safety: The hints are verified in `self.validate`.
        let derived_hints = unsafe {
            build_derived_hints(
                note_hashes,
                nullifiers,
                logs,
                expected_kept_note_hashes,
                transient_data_squashing_hints,
            )
        };

        Self {
            note_hashes,
            nullifiers,
            logs,
            expected_kept_note_hashes,
            expected_kept_nullifiers,
            expected_kept_logs,
            min_revertible_side_effect_counter,
            transient_data_squashing_hints,
            derived_hints,
        }
    }

    /// Validates that squashable transient data was correctly removed based on both user hints and derived hints.
    ///
    /// This function checks three major things:
    /// - Squashing hints are well-formed: active hints must reference unique and in-bounds note hash and nullifier indices.
    /// - Note hashes and nullifiers are squashed or kept appropriately.
    /// - Private logs are squashed or propagated, and note logs are correctly linked to the note hashes.
    pub fn validate(self) {
        validate_transient_data_squashing_hints(
            self.note_hashes,
            self.nullifiers,
            self.transient_data_squashing_hints,
            self.derived_hints.num_active_squashing_hints,
            self.derived_hints.nullifier_index_sorted_tuples,
        );

        validate_note_hash_nullifier_squashing(
            self.note_hashes,
            self.nullifiers,
            self.expected_kept_note_hashes,
            self.expected_kept_nullifiers,
            self.min_revertible_side_effect_counter,
            self.transient_data_squashing_hints,
            self.derived_hints.num_active_squashing_hints,
            self.derived_hints.note_hash_squash_flags,
            self.derived_hints.nullifier_squash_flags,
        );

        validate_log_squashing(
            self.logs,
            self.note_hashes,
            self.expected_kept_logs,
            self.expected_kept_note_hashes,
            self.min_revertible_side_effect_counter,
            self.transient_data_squashing_hints,
            self.derived_hints.note_log_linked_source_indices,
        );
    }
}

pub(crate) mod tests {
    use crate::reset::transient_data::tests::{mock_log, TransientDataFixtureBuilder};
    use dep::types::{
        abis::{nullifier::Nullifier, private_log::PrivateLogData},
        side_effect::Counted,
    };

    #[test]
    fn succeeds_empty_everything() {
        TransientDataFixtureBuilder::new().validate();
    }

    #[test]
    fn succeeds_squash_all() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            Counted::new(11, 1),
            Counted::new(22, 2),
            Counted::new(33, 3),
            Counted::new(44, 4),
        ]);

        builder.add_nullifiers([
            Nullifier { value: 55, note_hash: 33 }.count(5),
            Nullifier { value: 66, note_hash: 11 }.count(6),
            Nullifier { value: 77, note_hash: 22 }.count(7),
            Nullifier { value: 88, note_hash: 44 }.count(8),
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 1 }.count(9),
            PrivateLogData { log: mock_log(202), note_hash_counter: 4 }.count(10),
            PrivateLogData { log: mock_log(303), note_hash_counter: 1 }.count(11),
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

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2)]);

        builder.add_nullifiers([
            Nullifier { value: 505, note_hash: 11 }.count(5),
            Nullifier { value: 606, note_hash: 22 }.count(6),
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 2 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 1 }.count(8),
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

        builder.add_note_hashes([Counted::new(11, 1), Counted::new(22, 2)]);

        builder.add_nullifiers([
            Nullifier { value: 505, note_hash: 22 }.count(5),
            Nullifier { value: 606, note_hash: 99 }.count(6),
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 2 }.count(7),
            PrivateLogData { log: mock_log(202), note_hash_counter: 1 }.count(8),
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
            Counted::new(11, 1),
            Counted::new(22, 2),
            Counted::new(33, 3),
            Counted::new(44, 4),
            Counted::new(55, 5),
            Counted::new(66, 6),
        ]);

        builder.add_nullifiers([
            Nullifier { value: 10, note_hash: 33 }.count(7),
            Nullifier { value: 20, note_hash: 0 }.count(8),
            Nullifier { value: 30, note_hash: 0 }.count(9),
            Nullifier { value: 40, note_hash: 11 }.count(10),
            Nullifier { value: 50, note_hash: 66 }.count(11),
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 5 }.count(12),
            PrivateLogData { log: mock_log(202), note_hash_counter: 0 }.count(13),
            PrivateLogData { log: mock_log(303), note_hash_counter: 1 }.count(14),
            PrivateLogData { log: mock_log(404), note_hash_counter: 1 }.count(15),
            PrivateLogData { log: mock_log(505), note_hash_counter: 6 }.count(16),
            PrivateLogData { log: mock_log(606), note_hash_counter: 0 }.count(17),
            PrivateLogData { log: mock_log(707), note_hash_counter: 1 }.count(18),
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
        builder.add_note_hashes([Counted::new(11, 1), Counted::new(11, 2), Counted::new(11, 3)]);

        // All the nullifiers nullify the same note hash value.
        builder.add_nullifiers([
            Nullifier { value: 505, note_hash: 11 }.count(5),
            Nullifier { value: 606, note_hash: 11 }.count(6),
            Nullifier { value: 707, note_hash: 11 }.count(7),
        ]);

        builder.add_logs([
            PrivateLogData { log: mock_log(101), note_hash_counter: 2 }.count(8),
            PrivateLogData { log: mock_log(202), note_hash_counter: 3 }.count(9),
            PrivateLogData { log: mock_log(303), note_hash_counter: 1 }.count(10),
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
