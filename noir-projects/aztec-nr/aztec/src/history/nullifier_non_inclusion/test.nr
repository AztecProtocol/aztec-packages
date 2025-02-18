use crate::history::nullifier_non_inclusion::{ProveNoteNotNullified, ProveNullifierNonInclusion};
use crate::oracle::random::random;

use crate::history::test;

#[test]
unconstrained fn note_not_nullified() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(2);

    context.historical_header.prove_note_not_nullified(retrieved_note, 15, context);
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_nullified_fails() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private();
    context.historical_header.prove_note_not_nullified(retrieved_note, 15, context);
}

#[test]
unconstrained fn nullifier_non_inclusion() {
    let (env) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(2);

    context.historical_header.prove_nullifier_non_inclusion(random());
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails() {
    let (env) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private();

    // We use the first nullifier created (because the TXe creates deterministic first nullifiers if no side-effects are emitted)
    context.historical_header.prove_nullifier_non_inclusion(6969 + 1);
}
