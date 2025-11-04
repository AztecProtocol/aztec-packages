use crate::history::note_validity::ProveNoteValidity;
use crate::history::test;

use crate::test::helpers::test_environment::PrivateContextOptions;

#[test(should_fail_with = "not found in tree NOTE_HASH_TREE at block")]
unconstrained fn fails_on_blocks_before_note_creation() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}

#[test]
unconstrained fn succeeds_on_blocks_after_creation_and_before_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT),
        |context| {
            let header = context.anchor_block_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn fails_on_blocks_after_note_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT),
        |context| {
            let header = context.anchor_block_header;
            header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}
