use crate::{
    note::{
        lifecycle::{create_note as lifecycle_create_note, destroy_note},
        note_getter::view_note,
        retrieved_note::RetrievedNote,
    },
    test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote},
};
use protocol_types::{address::AztecAddress, traits::FromField};

pub(crate) global NOTE_STORAGE_SLOT: Field = 420;
pub(crate) global NOTE_CREATED_AT: u32 = 2;
pub(crate) global NOTE_NULLIFIED_AT: u32 = 3;
pub(crate) global NOTE_OWNER: AztecAddress = AztecAddress::from_field(50);

pub(crate) unconstrained fn create_note() -> (TestEnvironment, RetrievedNote<MockNote>) {
    let env = TestEnvironment::new();

    let note_message = env.private_context(|context| {
        let mut mock_note = MockNote::new(69);

        lifecycle_create_note(
            context,
            NOTE_OWNER,
            NOTE_STORAGE_SLOT,
            mock_note.build_note(),
        )
    });

    // Verify the note was inserted in the correct block
    assert_eq(env.last_block_number(), NOTE_CREATED_AT);

    env.discover_note(note_message);

    let retrieved_note =
        env.utility_context(|_| view_note(Option::some(NOTE_OWNER), NOTE_STORAGE_SLOT));

    (env, retrieved_note)
}

pub(crate) unconstrained fn create_note_and_nullify_it() -> (TestEnvironment, RetrievedNote<MockNote>) {
    let (env, retrieved_note) = create_note();

    env.private_context(|context| { destroy_note(context, retrieved_note, NOTE_STORAGE_SLOT); });

    // Verify the note was nullified in the correct block
    assert_eq(env.last_block_number(), NOTE_NULLIFIED_AT);

    (env, retrieved_note)
}
