use crate::history::{note_inclusion::ProveNoteInclusion, test};

#[test]
unconstrained fn note_inclusion() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(false);

    let context = &mut env.private();

    // docs:start:prove_note_inclusion
    context.historical_header.prove_note_inclusion(retrieved_note, 15);
    // docs:end:prove_note_inclusion
}

#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn note_inclusion_fails() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(false);

    let context = &mut env.private_at(1);
    context.historical_header.prove_note_inclusion(retrieved_note, 15);
}
