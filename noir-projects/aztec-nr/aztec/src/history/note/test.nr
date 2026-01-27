use crate::history::{note::{assert_note_existed_by, assert_note_was_valid_by}, test};

use crate::test::helpers::test_environment::PrivateContextOptions;

#[test]
unconstrained fn succeeds_on_blocks_after_note_creation() {
    let (env, hinted_note) = test::create_note();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT),
        |context| {
            let header = context.anchor_block_header;
            let _ = assert_note_existed_by(header, hinted_note);
        },
    );
}

#[test(should_fail_with = "not found in the note hash tree at block")]
unconstrained fn fails_on_blocks_before_note_creation() {
    let (env, hinted_note) = test::create_note();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            let _ = assert_note_existed_by(header, hinted_note);
        },
    );
}

#[test(should_fail_with = "not found in the note hash tree at block")]
unconstrained fn validity_fails_on_blocks_before_note_creation() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            assert_note_was_valid_by(header, hinted_note, context);
        },
    );
}

#[test]
unconstrained fn succeeds_on_blocks_after_creation_and_before_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT),
        |context| {
            let header = context.anchor_block_header;
            assert_note_was_valid_by(header, hinted_note, context);
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn fails_on_blocks_after_note_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT),
        |context| {
            let header = context.anchor_block_header;
            assert_note_was_valid_by(header, hinted_note, context);
        },
    );
}
