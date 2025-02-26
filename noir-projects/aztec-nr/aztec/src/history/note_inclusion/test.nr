use crate::history::{note_inclusion::ProveNoteInclusion, test};

// In this test, we create a note and prove its inclusion in the block.
#[test]
unconstrained fn note_inclusion() {
    let (env, retrieved_note) = test::create_note();

    let context = &mut env.private();

    // docs:start:prove_note_inclusion
    context.historical_header.prove_note_inclusion(retrieved_note, 15);
    // docs:end:prove_note_inclusion
}

// In this test, we create a note and fail to prove its inclusion in a block before its creation.
#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn note_inclusion_fails() {
    let (env, retrieved_note) = test::create_note();

    let context = &mut env.private_at(1);
    context.historical_header.prove_note_inclusion(retrieved_note, 15);
}
