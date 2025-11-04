use crate::note::{
    lifecycle::{create_note as lifecycle_create_note, destroy_note},
    note_metadata::NoteMetadata,
};
use crate::note::retrieved_note::RetrievedNote;
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

pub(crate) global NOTE_STORAGE_SLOT: Field = 420;
pub(crate) global NOTE_CREATED_AT: u32 = 2;
pub(crate) global NOTE_NULLIFIED_AT: u32 = 3;

pub(crate) unconstrained fn create_note() -> (TestEnvironment, RetrievedNote<MockNote>) {
    let env = TestEnvironment::new();

    // We create a note in block NOTE_CREATED_AT
    let retrieved_note = env.private_context(|context| {
        let contract_address = context.this_address();

        // The test environment doesn't yet supporting delivering settled notes, so we hardcode the nonce we know the
        // note will have if emitted as the only note in block NOTE_CREATED_AT.
        let retrieved_note = MockNote::new(69)
            .contract_address(contract_address)
            .note_metadata(NoteMetadata::from_raw_data(
                false,
                0x1449ecaf02190d28dbfe6043702b84082dfbf7bdf16b9970099a8a452ec42f10,
            ))
            .build_retrieved_note();

        let _ = lifecycle_create_note(context, NOTE_STORAGE_SLOT, retrieved_note.note);

        retrieved_note
    });

    // Verify the note was inserted in the correct block
    assert_eq(env.last_block_number(), NOTE_CREATED_AT);

    (env, retrieved_note)
}

pub(crate) unconstrained fn create_note_and_nullify_it() -> (TestEnvironment, RetrievedNote<MockNote>) {
    let (env, retrieved_note) = create_note();

    env.private_context(|context| { destroy_note(context, retrieved_note, NOTE_STORAGE_SLOT); });

    // Verify the note was nullified in the correct block
    assert_eq(env.last_block_number(), NOTE_NULLIFIED_AT);

    (env, retrieved_note)
}
