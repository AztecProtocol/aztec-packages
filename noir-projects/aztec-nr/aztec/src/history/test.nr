use crate::{
    note::{
        lifecycle::{create_note as lifecycle_create_note, destroy_note},
        note_metadata::NoteMetadata,
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

    // We create a note in block NOTE_CREATED_AT
    let retrieved_note = env.private_context(|context| {
        let mut mock_note = MockNote::new(69);

        let emitted_note = lifecycle_create_note(
            context,
            NOTE_OWNER,
            NOTE_STORAGE_SLOT,
            mock_note.build_note(),
        );

        let contract_address = context.this_address();

        // The test environment doesn't yet supporting delivering settled notes, so we hardcode the nonce we know the
        // note will have if emitted as the only note in block NOTE_CREATED_AT.
        mock_note
            .contract_address(contract_address)
            .note_metadata(NoteMetadata::from_raw_data(
                false,
                0x2426ed0754c755bbeaa3bc552819eab6339cdf25f64f5a5207c86dbb0f1add2d,
            ))
            .randomness(emitted_note.content.randomness)
            .build_retrieved_note()
    });

    // Verify the note was inserted in the correct block
    assert_eq(env.last_block_number(), NOTE_CREATED_AT);

    (env, retrieved_note)
}

pub(crate) unconstrained fn create_note_and_nullify_it() -> (TestEnvironment, RetrievedNote<MockNote>) {
    let (env, retrieved_note) = create_note();

    env.private_context(|context| {
        destroy_note(context, retrieved_note, NOTE_OWNER, NOTE_STORAGE_SLOT);
    });

    // Verify the note was nullified in the correct block
    assert_eq(env.last_block_number(), NOTE_NULLIFIED_AT);

    (env, retrieved_note)
}
