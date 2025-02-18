use crate::history::note_validity::ProveNoteValidity;
use crate::history::test;

#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn note_not_valid_due_to_non_inclusion() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(1);

    context.historical_header.prove_note_validity(retrieved_note, 15, context);
}

#[test]
unconstrained fn note_is_valid() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private_at(2);

    // docs:start:prove_note_validity
    context.historical_header.prove_note_validity(retrieved_note, 15, context);
    // docs:end:prove_note_validity
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_valid_due_to_nullification() {
    let (env, retrieved_note) = test::create_note_and_optionally_nullify_it(true);

    let context = &mut env.private();
    context.historical_header.prove_note_validity(retrieved_note, 15, context);
}
