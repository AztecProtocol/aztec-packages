use crate::history::{
    note::{assert_note_existed_by, assert_note_was_not_nullified_by, assert_note_was_nullified_by},
    nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by},
    test,
};
use crate::oracle::{nullifiers::notify_created_nullifier, random::random};
use crate::protocol::{constants::DOM_SEP__OUTER_NULLIFIER, hash::poseidon2_hash_with_separator, traits::ToField};
use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};

#[test]
unconstrained fn note_is_nullified_succeeds_on_blocks_after_note_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT), |context| {
        let header = context.anchor_block_header;
        let confirmed_note = assert_note_existed_by(header, hinted_note);
        assert_note_was_nullified_by(header, confirmed_note, context);
    });
}

#[test(should_fail_with = "Nullifier membership witness not found at block")]
unconstrained fn note_is_nullified_fails_on_blocks_before_note_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            let confirmed_note = assert_note_existed_by(header, hinted_note);
            assert_note_was_nullified_by(header, confirmed_note, context);
        },
    );
}

#[test]
unconstrained fn assert_nullifier_existed_by_succeeds_on_blocks_after_nullifier_creation() {
    let env = TestEnvironment::new();

    let siloed_nullifier = env.private_context(|context| {
        let unsiloed_nullifier = 42069;
        notify_created_nullifier(unsiloed_nullifier);

        // We need to compute the siloed nullifier so we can check for its inclusion in state.
        poseidon2_hash_with_separator(
            [context.this_address().to_field(), unsiloed_nullifier],
            DOM_SEP__OUTER_NULLIFIER,
        )
    });

    let nullifier_created_at = env.last_block_number();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(nullifier_created_at), |context| {
        let header = context.anchor_block_header;
        assert_nullifier_existed_by(header, siloed_nullifier);
    });
}

#[test(should_fail_with = "Nullifier membership witness not found")]
unconstrained fn assert_nullifier_existed_by_fails_on_blocks_before_nullifier_creation() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let header = context.anchor_block_header;
        assert_nullifier_existed_by(header, random());
    });
}

#[test]
unconstrained fn note_not_nullified_succeeds_in_blocks_before_note_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            let confirmed_note = assert_note_existed_by(header, hinted_note);
            assert_note_was_not_nullified_by(header, confirmed_note, context);
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_nullified_fails_in_blocks_after_note_nullification_fails() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT), |context| {
        let header = context.anchor_block_header;
        let confirmed_note = assert_note_existed_by(header, hinted_note);
        assert_note_was_not_nullified_by(header, confirmed_note, context);
    });
}

#[test]
unconstrained fn nullifier_non_inclusion_succeeds_in_blocks_before_nullifier_creation() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let header = context.anchor_block_header;
        assert_nullifier_did_not_exist_by(header, random());
    });
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails_in_blocks_after_nullifier_creation() {
    let env = TestEnvironment::new();

    let siloed_nullifier = env.private_context(|context| {
        let unsiloed_nullifier = 42069;
        notify_created_nullifier(unsiloed_nullifier);

        // We need to compute the siloed nullifier so we can check for its inclusion in state.
        poseidon2_hash_with_separator(
            [context.this_address().to_field(), unsiloed_nullifier],
            DOM_SEP__OUTER_NULLIFIER,
        )
    });

    let nullifier_created_at = env.last_block_number();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(nullifier_created_at), |context| {
        let header = context.anchor_block_header;
        assert_nullifier_did_not_exist_by(header, siloed_nullifier);
    });
}
