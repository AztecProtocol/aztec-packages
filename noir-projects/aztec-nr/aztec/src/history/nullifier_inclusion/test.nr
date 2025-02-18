use crate::history::{nullifier_inclusion::{ProveNoteIsNullified, ProveNullifierInclusion}, test};
use crate::oracle::random::random;

#[test]
unconstrained fn note_is_nullified() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private();

    context.historical_header.prove_note_is_nullified(retrieved_note, 15, context);
}

#[test(should_fail_with = "Nullifier membership witness not found at block 2.")]
unconstrained fn note_is_not_nullified() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(2);

    context.historical_header.prove_note_is_nullified(retrieved_note, 15, context);
}

#[test]
unconstrained fn nullifier_inclusion() {
    let (env) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(2);

    // We use the first nullifier created (because the TXe creates deterministic first nullifiers if no side-effects are emitted)
    // docs:start:prove_nullifier_inclusion
    context.historical_header.prove_nullifier_inclusion(6969 + 1);
    // docs:end:prove_nullifier_inclusion
}

#[test(should_fail_with = "Nullifier membership witness not found")]
unconstrained fn nullifier_inclusion_fails() {
    let (env) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private();
    context.historical_header.prove_nullifier_inclusion(random());
}
