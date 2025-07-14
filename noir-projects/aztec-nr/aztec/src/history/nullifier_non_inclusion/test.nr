use crate::history::{
    nullifier_non_inclusion::{ProveNoteNotNullified, ProveNullifierNonInclusion},
    test,
};
use crate::oracle::{notes::notify_created_nullifier, random::random};
use crate::test::helpers::test_environment::TestEnvironment;
use dep::protocol_types::{
    constants::GENERATOR_INDEX__OUTER_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::ToField,
};

// In these tests, we create a note in one block and nullify it in the next.

// In this test, we prove the absence of the note's nullifier in state at the block before it was nullified.
#[test]
unconstrained fn note_not_nullified() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(test::NOTE_NULLIFIED_AT - 1);

    context.historical_header.prove_note_not_nullified(
        retrieved_note,
        test::NOTE_STORAGE_SLOT,
        context,
    );
}

// In this test, we fail prove the absence of the note's nullifier in state at the block it was nullified in.
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_nullified_fails() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(test::NOTE_NULLIFIED_AT);
    context.historical_header.prove_note_not_nullified(
        retrieved_note,
        test::NOTE_STORAGE_SLOT,
        context,
    );
}

// In this test, we prove the absence of an arbitrary nullifier in state.
#[test]
unconstrained fn nullifier_non_inclusion() {
    let mut env = TestEnvironment::new();

    let context = &mut env.private();

    context.historical_header.prove_nullifier_non_inclusion(random());
}

// In this test, we create a nullifier and fail to prove its absence in state (we are checking the
// siloed version of it because that is what is actually pushed to state).
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails() {
    let mut env = TestEnvironment::new();

    let unsiloed_nullifier = 42069;

    // We need to create the siloed nullifier so we can check for its inclusion in state.
    let siloed_nullifier = poseidon2_hash_with_separator(
        [env.contract_address().to_field(), unsiloed_nullifier],
        GENERATOR_INDEX__OUTER_NULLIFIER,
    );

    notify_created_nullifier(unsiloed_nullifier);

    let nullifier_created_at = env.next_block_number();

    env.mine_block();

    let context = &mut env.private_at(nullifier_created_at);

    context.historical_header.prove_nullifier_non_inclusion(siloed_nullifier);
}
