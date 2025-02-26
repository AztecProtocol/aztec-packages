use crate::history::note_validity::ProveNoteValidity;
use crate::history::test;

// In these tests, we create a note in one block and nullify it in the next.

// In this test, we fail to prove the note's validity in the block before its creation. It fails the validity check due to
// non-inclusion of the note in the block specified.
#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn note_not_valid_due_to_non_inclusion() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(1);

    context.historical_header.prove_note_validity(retrieved_note, 15, context);
}

// In this test, we prove the note's validity in the block after its creation, and before its nullification. It succeeds
// because it is included and not nullified at the block specified
#[test]
unconstrained fn note_is_valid() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(2);

    // docs:start:prove_note_validity
    context.historical_header.prove_note_validity(retrieved_note, 15, context);
    // docs:end:prove_note_validity
}

// In this test, we fail to prove the note's validity in the block after its nullification. It fails the validity check due to
// its nullifier being included in the state at the block specified.
#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_valid_due_to_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private();
    context.historical_header.prove_note_validity(retrieved_note, 15, context);
}
