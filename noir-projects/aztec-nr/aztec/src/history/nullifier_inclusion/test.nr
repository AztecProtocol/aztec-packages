use crate::history::{nullifier_inclusion::{ProveNoteIsNullified, ProveNullifierInclusion}, test};
use crate::oracle::random::random;
use crate::test::helpers::test_environment::FIRST_NULLIFIER_EMITTED_IN_TXE;

// In these tests, we create a note in one block and nullify it in the next.

// In this test, we prove the presence of the note's nullifier in state at the block it was nullified in.
#[test]
unconstrained fn note_is_nullified() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(test::NOTE_NULLIFIED_AT);

    context.historical_header.prove_note_is_nullified(
        retrieved_note,
        test::NOTE_STORAGE_SLOT,
        context,
    );
}

// In this test, we fail to prove the presence of the note's nullifier in state at the block before it was nullified.
#[test(should_fail_with = "Nullifier membership witness not found at block 2.")]
unconstrained fn note_is_not_nullified() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    let context = &mut env.private_at(test::NOTE_NULLIFIED_AT - 1);

    context.historical_header.prove_note_is_nullified(
        retrieved_note,
        test::NOTE_STORAGE_SLOT,
        context,
    );
}

// In this test, we prove the inclusion of an existing nullifier in state. We use know FIRST_NULLIFIER_EMITTED_IN_TXE exists
// because the TXe creates deterministic first nullifiers if no side-effects are emitted.
#[test]
unconstrained fn nullifier_inclusion() {
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private();

    // docs:start:prove_nullifier_inclusion
    context.historical_header.prove_nullifier_inclusion(FIRST_NULLIFIER_EMITTED_IN_TXE);
    // docs:end:prove_nullifier_inclusion
}

// In this test, we fail to prove the inclusion of an arbitrary nullifier in state.
#[test(should_fail_with = "Nullifier membership witness not found")]
unconstrained fn nullifier_inclusion_fails() {
    let (env) = test::create_note_and_nullify_it();

    let context = &mut env.private();
    context.historical_header.prove_nullifier_inclusion(random());
}
