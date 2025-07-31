mod validate_squashable_note_hash_nullifier_pair;

use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use dep::types::{
    abis::{note_hash::ScopedNoteHash, nullifier::ScopedNullifier},
    utils::arrays::ClaimedLengthArray,
};
use validate_squashable_note_hash_nullifier_pair::validate_squashable_note_hash_nullifier_pair;

/// Validates the squashing of (note hash, nullifier) pairs based on provided hints.
///
/// This function ensures that only eligible pairs are squashed, that the squashing flags are correctly set, and that
/// the remaining note hashes and nullifiers match the expected propagated values.
///
/// It assumes that the uniqueness and bounds of the hinted indices have already been validated (which is done in
/// `validate_transient_data_squashing_hints.nr`).
pub fn validate_note_hash_nullifier_squashing<let NoteHashesLen: u32, let NullifiersLen: u32, let SquashingHintsLen: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    min_revertible_side_effect_counter: u32,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    num_active_squashing_hints: u32,
    note_hash_squash_flags: [bool; NoteHashesLen],
    nullifier_squash_flags: [bool; NullifiersLen],
) {
    // This loop iterates over the hints `transient_data_squashing_hints` and validates that each (note hash, nullifier)
    // pair is eligible to be squashed.
    //
    // We iterate over the hints directly (rather than the full note hashes or nullifiers arrays) so that the circuit
    // size can be optimized according to the number of squashable pairs needed.
    let mut is_active_hint = true;
    for i in 0..SquashingHintsLen {
        let hint = transient_data_squashing_hints[i];

        // Determine if the hint can be used.
        // Only the first `num_active_squashing_hints` hints are active and allowed to be used for squashing.
        is_active_hint &= i != num_active_squashing_hints;

        if is_active_hint {
            // We have a hint that points to a (note, nullifier) pair that can be squashed.
            //
            // Note: We made sure both indices are within the claimed lengths in
            // `validate_transient_data_squashing_hints.nr`.
            let nullifier = nullifiers.array[hint.nullifier_index];
            let note_hash = note_hashes.array[hint.note_hash_index];

            // Ensure the (note hash, nullifier) pair can be squashed.
            validate_squashable_note_hash_nullifier_pair(
                note_hash,
                nullifier,
                min_revertible_side_effect_counter,
            );

            // Validate the squash flags are correctly set.
            // They are used later to check that the kept note hashes and nullifiers are correctly propagated.
            assert(note_hash_squash_flags[hint.note_hash_index], "Wrong squashed note hash hint");
            assert(nullifier_squash_flags[hint.nullifier_index], "Wrong squashed nullifier hint");
        }
    }

    // In the checks below, we use the number of squashed pairs to validate the number of propagated items.
    // Because all the indices in the active hints are unique (validated in `validate_transient_data_squashing_hints`),
    // the number of squashed pairs is equal to the number of active squashing hints.
    let num_squashed_pairs = num_active_squashing_hints;

    // === Validate the expected kept note hashes ===
    // Iterate over the `note_hash_squash_flags` and check that the non-squashed note hashes are propagated correctly.
    //
    // Earlier we ensured that a note hash's corresponding flag in `note_hash_squash_flags` is set to `true` when
    // it is squashed. Here we propagate the note hashes whose flags are `false`, and check that they match the expected
    // kept note hashes.
    let mut kept_note_hashes_counter = 0;
    for i in 0..NoteHashesLen {
        if !note_hash_squash_flags[i] {
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
        kept_note_hashes_counter + num_squashed_pairs,
        NoteHashesLen,
        "Wrong number of note hashes removed",
    );
    // Ensure that the length of the kept note hashes array is correct.
    assert_eq(
        expected_kept_note_hashes.length,
        note_hashes.length - num_squashed_pairs,
        "Length of expected kept note hashes array is incorrect",
    );

    // === Validate the expected kept nullifiers ===
    // Iterate over the `nullifier_squash_flags` and check that the non-squashed nullifiers are propagated correctly.
    //
    // Earlier we ensured that a nullifier's corresponding flag in `nullifier_squash_flags` is set to `true` when
    // it is squashed. Here we propagate the nullifiers whose flags are `false`, and check that they match the expected
    // kept nullifiers.
    let mut kept_nullifiers_counter = 0;
    for i in 0..NullifiersLen {
        if !nullifier_squash_flags[i] {
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
        kept_nullifiers_counter + num_squashed_pairs,
        NullifiersLen,
        "Wrong number of nullifiers removed",
    );
    // Ensure that the length of the kept nullifiers array is correct.
    assert_eq(
        expected_kept_nullifiers.length,
        nullifiers.length - num_squashed_pairs,
        "Length of expected kept nullifiers array is incorrect",
    );
}

mod tests {
    use crate::reset::transient_data::tests::TransientDataFixtureBuilder;
    use types::abis::{note_hash::NoteHash, nullifier::Nullifier};

    // ===========
    // Note hashes
    // ===========

    #[test]
    fn succeeds_keep_one_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_kept_note_hash_wrong_value() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        // Tweak the value of the kept note hash.
        builder.expected_kept_note_hashes.array[0].note_hash.value += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_kept_note_hash_wrong_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        // Tweak the counter of the kept note hash.
        builder.expected_kept_note_hashes.array[0].note_hash.counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_kept_note_hash_wrong_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        // Tweak the contract address of the kept note hash.
        builder.expected_kept_note_hashes.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_note_hash_not_kept() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        // The note hash at index 0 is not kept.

        builder.validate();
    }

    #[test(should_fail_with = "Wrong number of note hashes removed")]
    fn fails_note_hash_not_kept_with_wrong_squash_flag() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        // The note hash at index 0 is not kept.

        let mut derived_hints = builder.build_derived_hints();

        // Set the hint to true so it's assumed the note hash has been squashed.
        derived_hints.note_hash_squash_flags[0] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Length of expected kept note hashes array is incorrect")]
    fn fails_increased_expected_kept_note_hashes_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        // Increase the claimed length to make the first empty note hash a valid item.
        builder.expected_kept_note_hashes.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept note hashes array is incorrect")]
    fn fails_decreased_expected_kept_note_hashes_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.keep_note_hashes([0]);

        // Decreased the claimed length to ignore the kept note hash.
        builder.expected_kept_note_hashes.length -= 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept note hashes array is incorrect")]
    fn fails_keep_note_hash_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        // Keep both note hashes.
        builder.keep_note_hashes([0, 1]);

        builder.validate();
    }

    #[test]
    fn succeeds_ignore_note_hash_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 22, counter: 2 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        // Keep both note hashes.
        builder.keep_note_hashes([0, 1]);

        // Change the claimed length of the kept note hashes array to 1, to ignore the note hash at index 1.
        builder.expected_kept_note_hashes.length = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated note hash does not match")]
    fn fails_keep_squashed_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Keep the note hash at index 0.
        builder.keep_note_hashes([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Wrong squashed note hash hint")]
    fn fails_keep_squashed_note_hash_wrong_squash_flag() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Keep the note hash at index 0.
        builder.keep_note_hashes([0]);

        let mut derived_hints = builder.build_derived_hints();

        // Set the hint to false so it's assumed the note hash has not been squashed.
        derived_hints.note_hash_squash_flags[0] = false;

        builder.validate_with_derived_hints(derived_hints);
    }

    // ==========
    // Nullifiers
    // ==========

    #[test]
    fn succeeds_keep_one_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_kept_nullifier_wrong_value() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Tweak the value of the kept nullifier.
        builder.expected_kept_nullifiers.array[0].nullifier.value += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_kept_nullifier_wrong_counter() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Tweak the counter of the kept nullifier.
        builder.expected_kept_nullifiers.array[0].nullifier.counter += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_kept_nullifier_wrong_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Tweak the note hash of the kept nullifier.
        builder.expected_kept_nullifiers.array[0].nullifier.note_hash += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_kept_nullifier_wrong_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Tweak the contract address of the kept nullifier.
        builder.expected_kept_nullifiers.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_nullifier_not_kept() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        // The nullifier at index 0 is not kept.

        builder.validate();
    }

    #[test(should_fail_with = "Wrong number of nullifiers removed")]
    fn fails_nullifier_not_kept_with_wrong_squash_flag() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        // The nullifier at index 0 is not kept.

        let mut derived_hints = builder.build_derived_hints();

        // Set the hint to true so it's assumed the nullifier has been squashed.
        derived_hints.nullifier_squash_flags[0] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Length of expected kept nullifiers array is incorrect")]
    fn fails_increased_expected_kept_nullifiers_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Increase the claimed length to make the first empty nullifier a valid item.
        builder.expected_kept_nullifiers.length += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept nullifiers array is incorrect")]
    fn fails_decreased_expected_kept_nullifiers_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.keep_nullifiers([0]);

        // Decreased the claimed length to ignore the kept nullifier.
        builder.expected_kept_nullifiers.length -= 1;

        builder.validate();
    }

    #[test(should_fail_with = "Length of expected kept nullifiers array is incorrect")]
    fn fails_keep_nullifier_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 505, counter: 5, note_hash: 11 },
        ]);

        // Change the length of the nullifiers array to 1, to make the nullifier at index 1 beyond the claimed length.
        builder.nullifiers.length = 1;

        // Keep both nullifiers.
        builder.keep_nullifiers([0, 1]);

        builder.validate();
    }

    #[test]
    fn succeeds_ignore_nullifier_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 505, counter: 5, note_hash: 11 },
        ]);

        // Change the length of the nullifiers array to 1, to make the nullifier at index 1 beyond the claimed length.
        builder.nullifiers.length = 1;

        // Keep both nullifiers.
        builder.keep_nullifiers([0, 1]);

        // Change the claimed length of the kept nullifiers array to 1, to ignore the nullifier at index 1.
        builder.expected_kept_nullifiers.length = 1;

        builder.validate();
    }

    #[test(should_fail_with = "Propagated nullifier does not match")]
    fn fails_keep_squashed_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Keep the nullifier at index 0.
        builder.keep_nullifiers([0]);

        builder.validate();
    }

    #[test(should_fail_with = "Wrong squashed nullifier hint")]
    fn fails_keep_squashed_nullifier_wrong_squash_flag() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Keep the nullifier at index 0.
        builder.keep_nullifiers([0]);

        let mut derived_hints = builder.build_derived_hints();

        // Set the hint to false so it's assumed the nullifier has not been squashed.
        derived_hints.nullifier_squash_flags[0] = false;

        builder.validate_with_derived_hints(derived_hints);
    }
}
