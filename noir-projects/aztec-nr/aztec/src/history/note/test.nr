use crate::history::{
    note::{
        assert_local_note_was_not_nullified_by, assert_local_note_was_nullified_by, assert_local_note_was_valid_by,
        assert_note_existed_by,
    },
    test,
};

use crate::note::ConfirmedNote;
use crate::protocol::{address::AztecAddress, traits::{FromField, ToField}};
use crate::test::helpers::test_environment::PrivateContextOptions;
use crate::test::mocks::mock_note::MockNote;

#[test]
unconstrained fn succeeds_on_blocks_after_note_creation() {
    let (env, hinted_note) = test::create_note();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT), |context| {
        let header = context.anchor_block_header;
        let _ = assert_note_existed_by(header, hinted_note);
    });
}

#[test(should_fail_with = "not found in the note hash tree at block")]
unconstrained fn fails_on_blocks_before_note_creation() {
    let (env, hinted_note) = test::create_note();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT - 1), |context| {
        let header = context.anchor_block_header;
        let _ = assert_note_existed_by(header, hinted_note);
    });
}

#[test(should_fail_with = "not found in the note hash tree at block")]
unconstrained fn validity_fails_on_blocks_before_note_creation() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT - 1), |context| {
        let header = context.anchor_block_header;
        assert_local_note_was_valid_by(header, hinted_note, context);
    });
}

#[test]
unconstrained fn succeeds_on_blocks_after_creation_and_before_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT), |context| {
        let header = context.anchor_block_header;
        assert_local_note_was_valid_by(header, hinted_note, context);
    });
}

#[test(should_fail_with = "Cannot prove nullifier non-inclusion")]
unconstrained fn fails_on_blocks_after_note_nullification() {
    let (env, hinted_note) = test::create_note_and_nullify_it();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT), |context| {
        let header = context.anchor_block_header;
        assert_local_note_was_valid_by(header, hinted_note, context);
    });
}

unconstrained fn foreign_hinted_note(executing_contract: AztecAddress) -> crate::note::HintedNote<MockNote> {
    let foreign_contract = AztecAddress::from_field(executing_contract.to_field() + 1);
    MockNote::new(69).contract_address(foreign_contract).build_hinted_note()
}

#[test(should_fail_with = "only supported for the executing contract's own notes")]
unconstrained fn validity_fails_for_foreign_contract_note() {
    let (env, hinted_note) = test::create_note();
    let executing_contract = AztecAddress::from_field(hinted_note.contract_address.to_field() + 1);

    let opts = PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT).at_contract_address(
        executing_contract,
    );
    env.private_context_opts(opts, |context| {
        let header = context.anchor_block_header;
        assert_local_note_was_valid_by(header, hinted_note, context);
    });
}

#[test(should_fail_with = "only supported for the executing contract's own notes")]
unconstrained fn nullified_fails_for_foreign_contract_note() {
    let (env, _) = test::create_note();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT), |context| {
        let header = context.anchor_block_header;
        let foreign_note = ConfirmedNote::new(foreign_hinted_note(context.this_address()), 0);
        assert_local_note_was_nullified_by(header, foreign_note, context);
    });
}

#[test(should_fail_with = "only supported for the executing contract's own notes")]
unconstrained fn not_nullified_fails_for_foreign_contract_note() {
    let (env, _) = test::create_note();

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(test::NOTE_CREATED_AT), |context| {
        let header = context.anchor_block_header;
        let foreign_note = ConfirmedNote::new(foreign_hinted_note(context.this_address()), 0);
        assert_local_note_was_not_nullified_by(header, foreign_note, context);
    });
}
