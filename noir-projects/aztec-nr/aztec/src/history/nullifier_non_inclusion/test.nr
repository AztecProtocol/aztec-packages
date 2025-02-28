use crate::history::nullifier_non_inclusion::{ProveNoteNotNullified, ProveNullifierNonInclusion};
use crate::oracle::random::random;

use crate::history::test;
use crate::test::helpers::test_environment::FIRST_NULLIFIER_EMITTED_IN_TXE;

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
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private();

    context.historical_header.prove_nullifier_non_inclusion(random());
}

// In this test, we fail to prove the absence of an existing nullifier in state. We use know FIRST_NULLIFIER_EMITTED_IN_TXE exists
// because the TXe creates deterministic first nullifiers if no side-effects are emitted.
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails() {
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private();

    context.historical_header.prove_nullifier_non_inclusion(FIRST_NULLIFIER_EMITTED_IN_TXE);
}
