use crate::history::nullifier_non_inclusion::{ProveNoteNotNullified, ProveNullifierNonInclusion};
use crate::oracle::random::random;

use crate::history::test;

// In these tests, we create a note in one block and nullify it in the next.

// In this test, we prove the absence of the note's nullifier in state before the note was nullified.
#[test]
unconstrained fn note_not_nullified() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(2);

    context.historical_header.prove_note_not_nullified(retrieved_note, 15, context);
}

// In this test, we fail to prove the absence of the note's nullifier in state at the current block (the block after it was nullified).
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_nullified_fails() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private();
    context.historical_header.prove_note_not_nullified(retrieved_note, 15, context);
}

// In this test, we prove the absence of an arbitrary nullifier in state.
#[test]
unconstrained fn nullifier_non_inclusion() {
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(2);

    context.historical_header.prove_nullifier_non_inclusion(random());
}

// In this test, we fail to prove the inclusion of an existing nullifier in state. We use 6969 + 1 because it is
// the first nullifier created (the TXe creates deterministic first nullifiers if no side-effects are emitted)
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails() {
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private();

    context.historical_header.prove_nullifier_non_inclusion(6969 + 1);
}
