use crate::history::note_validity::ProveNoteValidity;
use crate::history::test;

use crate::test::helpers::test_environment::PrivateContextOptions;

#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn fails_on_blocks_before_note_creation() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(test::NOTE_CREATED_AT - 1),
        |context| {
            let header = context.historical_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}

#[test]
unconstrained fn succeeds_on_blocks_after_creation_and_before_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(test::NOTE_CREATED_AT),
        |context| {
            // docs:start:prove_note_validity
            let header = context.historical_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
            // docs:end:prove_note_validity
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn fails_on_blocks_after_note_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(test::NOTE_NULLIFIED_AT),
        |context| {
            let header = context.historical_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}
