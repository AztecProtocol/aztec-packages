use types::{
    abis::{note_hash::NoteHash, nullifier::Nullifier},
    side_effect::{Counted, Ordered, Scoped},
};

/// Validates that a (note hash, nullifier) pair is eligible to be squashed.
///
/// A note hash and its corresponding nullifier can only be squashed if:
/// - The nullifier explicitly nullifies the given note hash (which the nullifier conveys through its `note_hash` field).
/// - Both belong to the same contract_address.
/// - The nullifier was created after the note hash (i.e., has a greater counter).
/// - If the nullifier is revertible, then the note hash must also be revertible (see below for why).
pub fn validate_squashable_note_hash_nullifier_pair(
    note_hash: Scoped<Counted<NoteHash>>,
    nullifier: Scoped<Counted<Nullifier>>,
    split_counter: u32,
) {
    // A zero-valued note hash is the aztec-nr "no transient link" sentinel: a nullifier that
    // nullifies a settled (tree-resident) note carries `note_hash == 0`. Such a pair must never be
    // squashed, otherwise the linkage check below is satisfied vacuously (0 == 0) and the
    // settled-note nullifier is silently dropped, leaving the note spendable.
    assert(note_hash.innermost() != 0, "Cannot squash a zero-valued transient note hash");

    // Ensure the nullifier refers to the note hash.
    assert_eq(
        note_hash.innermost(),
        nullifier.innermost().note_hash,
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

    // If the nullifier is revertible (i.e., counter > `split_counter`), the note hash must also be revertible.
    //
    // A revertible nullifier and non-revertible note hash pair can't be squashed; they must be propagated.
    // This is because if the tx were to then revert (in some public function), the revertible nullifier must be discarded
    // (by the definition of "revertible"), but the non-revertible note must still be inserted
    // (by the definition of "non-revertible"). But if we were to have squashed this (note, nullifier) pair
    // within private-land, then the non-revertible note would be lost, and a reverting public function would
    // not know of it in order to fullfil its job of inserting all non-revertible side-effects.
    //
    // Note: No need to check the other way around. Since the nullifier counter must be larger than the note hash
    // counter, and since all non-revertible counters come _before_ revertible counters in a tx, it's not possible
    // to have a non-revertible nullifier nullifying a revertible note hash.
    //
    // Note: for private-only txs (where this is not a concern), `split_counter` has already been set as
    // `0` within `validate_transient_data`.
    // Note: if it's private-only and `split_counter` is therefore `0`, it is not possible for any
    // side-effect counter to be `0` (as enforced by the init and inner kernel circuits).
    // Otherwise, `split_counter` is the `min_revertible_side_effect_counter` of the tx, which is
    // asserted to be distinct from all other counters in the init and inner kernel circuits.
    if nullifier.counter() > split_counter {
        assert(
            note_hash.counter() > split_counter,
            "Cannot squash a non-revertible note hash with a revertible nullifier",
        );
    }
}

mod tests {
    use crate::reset::transient_data::tests::TransientDataFixtureBuilder;
    use types::{abis::nullifier::Nullifier, side_effect::Counted};

    // PoC for kernels-audit #538 (https://github.com/AztecProtocol/aztec-claude/issues/538): a
    // zero-valued note hash paired with a settled-note nullifier (`nullifier.note_hash == 0`, the
    // aztec-nr "no transient link" sentinel) satisfies the linkage `assert_eq` vacuously (0 == 0),
    // so the reset squashes the pair and silently drops the settled-note nullifier. The guard added
    // for this finding now rejects the pair, so this is a regression test: it must fail with the
    // guard's message.
    #[test(should_fail_with = "Cannot squash a zero-valued transient note hash")]
    fn poc_538_squash_zero_value_note_hash_drops_settled_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        // 0-valued note hash within `note_hashes.length` (push_note_hash(0) is permitted by aztec-nr
        // and only rejected at the tail, after this squash).
        builder.add_note_hashes([Counted::new(0, 1)]);

        // Settled-note nullifier shape: `note_hash == 0`.
        builder.add_nullifiers([Nullifier { value: 505, note_hash: 0 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // expected_kept_* stay empty: both arrays are emptied by the squash.
        builder.validate();
    }

    #[test]
    fn succeeds_squash_one_pair() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match")]
    fn fails_mismatch_note_hash_value() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 1)]);

        // This nullifier does not link to the note hash.
        builder.add_nullifiers([Nullifier { value: 505, note_hash: 99 }.count(5)]);

        // Squash the note hash (11) with a nullifier that has a different note_hash value (99).
        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Contract address of the hinted transient note hash does not match")]
    fn fails_mismatch_contract_address() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        // Tweak the contract address of the note hash to be different from the nullifier.
        builder.note_hashes.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Cannot nullify a note hash created afterwards")]
    fn fails_nullify_note_hash_emitted_afterwards() {
        let mut builder = TransientDataFixtureBuilder::new();

        // The note hash has a larger counter than its nullifier.
        builder.add_note_hashes([Counted::new(11, 9)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test(should_fail_with = "Cannot squash a non-revertible note hash with a revertible nullifier")]
    fn fails_nullify_non_revertible_note_hash_with_revertible_nullifier() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        // Make the note hash non-revertible and the nullifier revertible.
        builder.split_counter = 3;

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test]
    fn succeeds_squash_both_revertible() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 5)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(9)]);

        // Both counters (5 and 9) are > split_counter (3), so both are revertible.
        builder.split_counter = 3;

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }

    #[test]
    fn succeeds_squash_both_non_revertible() {
        let mut builder = TransientDataFixtureBuilder::new();

        builder.add_note_hashes([Counted::new(11, 1)]);

        builder.add_nullifiers([Nullifier { value: 505, note_hash: 11 }.count(5)]);

        // Both counters (1 and 5) are < split_counter (10), so both are non-revertible.
        builder.split_counter = 10;

        builder.add_squashing_hint(0, 0);

        builder.validate();
    }
}
