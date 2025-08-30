use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use types::{
    abis::{note_hash::ScopedNoteHash, nullifier::ScopedNullifier},
    utils::arrays::{ClaimedLengthArray, SortedTuple},
};

/// Validates that the `note_hash_index` and `nullifier_index` in **active** squashing hints are unique, and are within
/// the claimed lengths of the note hashes and nullifiers arrays.
///
/// **Active** hints are the first `num_active_squashing_hints` entries in the `transient_data_squashing_hints` array.
///
/// The validation of uniqueness prevents two or more hints from referencing the same note hash or nullifier, which
/// could otherwise result in double squashing - squashing multiple note hashes with the same nullifier, or vice versa.
/// Such collisions would also make the number of squashed (note hash, nullifier) pairs less than
/// `num_active_squashing_hints`, allowing some data to be incorrectly dropped.
/// See `validate_note_hash_nullifier_squashing` for details on how the value `num_active_squashing_hints` is used in
/// propagation checks.
///
/// The validation against the claimed lengths prevent malicious users from faking a note hash or nullifier beyond the
/// claimed length to justify squashing a nullifier or note hash that should be kept.
pub fn validate_transient_data_squashing_hints<let NoteHashesLen: u32, let NullifiersLen: u32, let SquashingHintsLen: u32>(
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    num_active_squashing_hints: u32,
    // Sorted values of nullifier indices (with original indices) used to validate uniqueness.
    nullifier_index_sorted_tuples: [SortedTuple<u32>; SquashingHintsLen],
) {
    let mut is_active_hint = true;
    for i in 0..SquashingHintsLen {
        let hint = transient_data_squashing_hints[i];
        let nullifier_index_sorted_tuple = nullifier_index_sorted_tuples[i];

        // === Determine if the hint is active ===
        // Only the first `num_active_squashing_hints` hints are active and allowed to be used for squashing.
        is_active_hint &= i != num_active_squashing_hints;

        if is_active_hint {
            // === Ensure each `note_hash_index` is unique ===
            // Ensure the first `num_active_squashing_hints` note hash indices are unique by checking that they are in
            // increasing order.
            if i != 0 {
                assert(
                    hint.note_hash_index > transient_data_squashing_hints[i - 1].note_hash_index,
                    "Note hash index hint is not in increasing order",
                );
            }

            // Unlike the `note_hash_index`, the `nullifier_index` is not sorted in `transient_data_squashing_hints`.
            // So we derived the sorted tuples of the nullifier indices and use them to check, in the following 4 steps,
            // that the first `num_active_squashing_hints` nullifier indices are unique.

            // === Nullifier index uniqueness check: Step 1 ===
            // This check guarantees that the first `num_active_squashing_hints` sorted tuples point back to the actual
            // nullifier indices in `transient_data_squashing_hints`.
            //
            // This check does not guarantee that the nullifier indices are unique, because two tuples may have the same
            // `original_index` that points to the same hint in `transient_data_squashing_hints`.
            assert_eq(
                nullifier_index_sorted_tuple.elem,
                transient_data_squashing_hints[nullifier_index_sorted_tuple.original_index]
                    .nullifier_index,
            );

            // === Nullifier index uniqueness check: Step 2 ===
            // Ensure all the "active" values in the sorted tuples are unique by checking that they are in increasing
            // order.
            if i != 0 {
                assert(
                    nullifier_index_sorted_tuple.elem > nullifier_index_sorted_tuples[i - 1].elem,
                    "Nullifier index sorted tuples are not in increasing order",
                );
            }
        } else {
            // Ensure that all indices in inactive hints (beyond `num_active_squashing_hints`) use the sentinel value.

            // Without this check, a log can be squashed by referring to an inactive squashing hint that points to a
            // fake note hash beyond the claimed length.
            assert_eq(
                hint.note_hash_index,
                NoteHashesLen,
                "Unused note hash index hint must be set to NoteHashesLen",
            );

            // === Nullifier index uniqueness check: Step 3 ===
            // Without this check, an inactive hint could be referenced by an active sorted tuple.
            // That would allow a duplicate nullifier index in an active hint to slip through undetected.
            assert_eq(
                hint.nullifier_index,
                NullifiersLen,
                "Unused nullifier index hint must be set to NullifiersLen",
            );
        }
    }

    // === Nullifier index uniqueness check: Step 4 ===
    // Ensure that the last active value in the sorted array is less than the claimed length of the nullifiers array.
    //
    // This implies that all nullifier indices before it (i.e., all active sorted values) are also less than the claimed
    // length.
    // Because step 3 guarantees that the nullifier index in all inactive hints is set to the sentinel value, we can be
    // sure that these earlier sorted values must come from active entries in `transient_data_squashing_hints`.
    if num_active_squashing_hints != 0 {
        assert(
            nullifier_index_sorted_tuples[num_active_squashing_hints - 1].elem < nullifiers.length,
            "Nullifier index hint exceeds claimed length",
        );
    }

    // === Check note hash index against claimed length ===
    // Ensure that the last active note hash index hint is less than the claimed length of the note hashes array.
    //
    // Since the active note hash indices are in increasing order, this check implies that all active note hash indices
    // are less than the claimed length.
    if num_active_squashing_hints != 0 {
        assert(
            transient_data_squashing_hints[num_active_squashing_hints - 1].note_hash_index
                < note_hashes.length,
            "Note hash index hint exceeds claimed length",
        );
    }
}

mod tests {
    use crate::reset::transient_data::tests::TransientDataFixtureBuilder;
    use types::abis::{note_hash::NoteHash, nullifier::Nullifier};

    // ===========
    // Note hashes
    // ===========

    #[test(should_fail_with = "Note hash index hint is not in increasing order")]
    fn fails_same_note_hash_squashed_by_two_nullifiers() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Both nullifiers are squashing the same note hash.
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(0, 1);

        builder.validate();
    }

    #[test(should_fail_with = "Note hash index hint is not in increasing order")]
    fn fails_same_note_hash_squashed_by_two_nullifiers_with_extra_note_hash() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            // Add a note hash that can't be squashed.
            NoteHash { value: 99, counter: 9 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Both nullifiers are squashing the same note hash at index 0.
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(0, 1);

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to squash the note hash at index 1.
        derived_hints.note_hash_squash_flags[1] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Unused note hash index hint must be set to NoteHashesLen")]
    fn fails_note_hash_squashed_by_inactive_hint() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 99, counter: 9 },
        ]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        let mut derived_hints = builder.build_derived_hints();

        // Set the note hash index to an inactive hint.
        builder.transient_data_squashing_hints[1].note_hash_index = 1;

        // Tweak the hint to squash the note hash at index 1.
        derived_hints.note_hash_squash_flags[1] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Note hash index hint exceeds claimed length")]
    fn fails_referring_to_note_hash_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 11, counter: 2 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Change the length of the note hashes array to 1, to make the note hash at index 1 beyond the claimed length.
        builder.note_hashes.length = 1;

        // Add a hint to squash using the note hash beyond the claimed length.
        builder.add_squashing_hint(1, 1);

        builder.validate();
    }

    // ==========
    // Nullifiers
    // ==========

    #[test(should_fail_with = "Nullifier index sorted tuples are not in increasing order")]
    fn fails_identical_note_hashes_squashed_by_same_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 11, counter: 2 },
        ]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        // Both note hashes are squashed by the nullifier at index 0.
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(1, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Nullifier index sorted tuples are not in increasing order")]
    fn fails_identical_note_hashes_squashed_by_same_nullifier_with_extra_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([
            NoteHash { value: 11, counter: 1 },
            NoteHash { value: 11, counter: 2 },
        ]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 11 },
            // Add an extra nullifier that can also squash one of the note hashes.
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Both note hashes are squashed by the nullifier at index 0.
        builder.add_squashing_hint(0, 0);
        builder.add_squashing_hint(1, 0);

        let mut derived_hints = builder.build_derived_hints();

        // Tweak the hint to squash the nullifier at index 1.
        derived_hints.nullifier_squash_flags[1] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Unused nullifier index hint must be set to NullifiersLen")]
    fn fails_nullifier_squashed_by_inactive_hint() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 22 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Change the length of the nullifiers array to 1, to make the nullifier at index 1 beyond the claimed length.
        builder.nullifiers.length = 1;

        builder.add_squashing_hint(0, 0);

        let mut derived_hints = builder.build_derived_hints();

        // Set the nullifier index to an inactive hint.
        builder.transient_data_squashing_hints[1].nullifier_index = 1;

        // Tweak the hint to squash the nullifier at index 1.
        derived_hints.nullifier_squash_flags[1] = true;

        builder.validate_with_derived_hints(derived_hints);
    }

    #[test(should_fail_with = "Nullifier index hint exceeds claimed length")]
    fn fails_referring_to_nullifier_beyond_claimed_length() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([
            Nullifier { value: 505, counter: 5, note_hash: 22 },
            Nullifier { value: 606, counter: 6, note_hash: 11 },
        ]);

        // Change the length of the nullifiers array to 1, to make the nullifier at index 1 beyond the claimed length.
        builder.nullifiers.length = 1;

        // Add a hint to squash using the nullifier beyond the claimed length.
        builder.add_squashing_hint(1, 1);

        builder.validate();
    }
}
