use crate::history::{note_inclusion::ProveNoteInclusion, test};

use crate::test::helpers::test_environment::PrivateContextOptions;

#[test]
unconstrained fn succeeds_on_blocks_after_note_creation() {
    let (env, retrieved_note) = test::create_note();

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(test::NOTE_CREATED_AT),
        |context| {
            // docs:start:prove_note_inclusion
            let header = context.historical_header;
            header.prove_note_inclusion(retrieved_note, test::NOTE_STORAGE_SLOT);
            // docs:end:prove_note_inclusion
        },
    );
}

#[test(should_fail_with = "not found in NOTE_HASH_TREE at block 1")]
unconstrained fn fails_on_blocks_before_note_creation() {
    let (env, retrieved_note) = test::create_note();

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(test::NOTE_CREATED_AT - 1),
        |context| {
            let header = context.historical_header;
            header.prove_note_inclusion(retrieved_note, test::NOTE_STORAGE_SLOT);
        },
    );
}
