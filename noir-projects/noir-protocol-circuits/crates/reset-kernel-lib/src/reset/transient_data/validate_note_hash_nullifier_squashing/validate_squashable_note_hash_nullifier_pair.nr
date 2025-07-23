use types::abis::{
    note_hash::ScopedNoteHash,
    nullifier::ScopedNullifier,
    side_effect::{Ordered, OrderedValue},
};

/// Validates that a (note hash, nullifier) pair is eligible to be squashed.
///
/// A note hash and its corresponding nullifier can only be squashed if:
/// - The nullifier explicitly nullifies the given note hash.
/// - Both belong to the same contract.
/// - The nullifier was created after the note hash (i.e., has a greater counter).
/// - If the nullifier is revertible, then the note hash must also be revertible.
pub fn validate_squashable_note_hash_nullifier_pair(
    note_hash: ScopedNoteHash,
    nullifier: ScopedNullifier,
    min_revertible_side_effect_counter: u32,
) {
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

    // Ensure the nullifier was created after the note hash it nullifies.
    assert(
        nullifier.counter() > note_hash.counter(),
        "Cannot nullify a note hash created afterwards",
    );

    // If the nullifier is revertible (i.e., counter >= `min_revertible_side_effect_counter`), the note hash must also
    // be revertible.
    //
    // A revertible nullifier and non-revertible note hash pair can't be squashed; they must be propagated.
    // That is because, if the transaction reverts, the non-revertible note hash will be kept, and the revertible
    // nullifier will be discarded. If we squash the pair, we would lose the non-revertible note hash that is no longer
    // nullified when the transaction reverts.
    //
    // Note: No need to check the other way around. Since the nullifier counter must be larger than the note hash
    // counter, it's not possible to have a non-revertible nullifier nullifying a revertible note hash.
    if nullifier.counter() >= min_revertible_side_effect_counter {
        assert(
            note_hash.counter() >= min_revertible_side_effect_counter,
            "Cannot squash a non-revertible note hash with a revertible nullifier",
        );
    }
}

mod tests {
    use crate::reset::transient_data::tests::TransientDataFixtureBuilder;
    use types::abis::{note_hash::NoteHash, nullifier::Nullifier};

    #[test]
    fn succeeds_squash_one_pair() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match")]
    fn fails_mismatch_note_hash_value() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        // This nullifier does not link to the note hash.
        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 99 }]);

        // Squash the note hash (11) with a nullifier that has a different note_hash value (99).
        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Contract address of the hinted transient note hash does not match")]
    fn fails_mismatch_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        // Tweak the contract address of the note hash to be different from the nullifier.
        builder.note_hashes.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot nullify a note hash created afterwards")]
    fn fails_nullify_note_hash_emitted_afterwards() {
        let mut builder = TransientDataFixtureBuilder::new();

        // The note hash has a larger counter than its nullifier.
        builder.add_note_hashes([NoteHash { value: 11, counter: 9 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a non-revertible note hash with a revertible nullifier")]
    fn fails_nullify_non_revertible_note_hash_with_revertible_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([NoteHash { value: 11, counter: 1 }]);

        builder.add_nullifiers([Nullifier { value: 505, counter: 5, note_hash: 11 }]);

        // Make the note hash non-revertible and the nullifier revertible.
        builder.min_revertible_side_effect_counter = 3;

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }
}
