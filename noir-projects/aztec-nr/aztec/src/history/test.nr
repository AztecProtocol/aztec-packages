use crate::{
    note::{
        lifecycle::{create_note as lifecycle_create_note, destroy_note},
        note_metadata::NoteMetadata,
    },
    oracle::execution::get_contract_address,
};
use crate::note::retrieved_note::RetrievedNote;
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

pub(crate) global NOTE_STORAGE_SLOT: Field = 420;
pub(crate) global NOTE_CREATED_AT: u32 = 2;
pub(crate) global NOTE_NULLIFIED_AT: u32 = 3;

// We create a note in block 2.
pub(crate) unconstrained fn create_note() -> (&mut TestEnvironment, RetrievedNote<MockNote>) {
    let mut env = TestEnvironment::new();
    let context = &mut env.private();

    // We sanity check that we are building block 2, thus block 2 is where the note will be added.
    assert_eq(env.next_block_number(), NOTE_CREATED_AT);

    let contract_address = get_contract_address();

    let retrieved_note = MockNote::new(69)
        .contract_address(contract_address)
        .note_metadata(NoteMetadata::from_raw_data(
            false,
            0x256c00025f88d92eb518176c67c9d619b876e7261ef3ef5879fac1cf3b5acab2,
        ))
        .build_retrieved_note();

    let _ = lifecycle_create_note(context, NOTE_STORAGE_SLOT, retrieved_note.note);

    // TODO(#12226): FIX
    // context.push_note_hash(retrieved_note.note.compute_note_hash(15));
    env.mine_block();

    (&mut env, retrieved_note)
}

// We create a note at block 2 and nullify it in the next block.
pub(crate) unconstrained fn create_note_and_nullify_it() -> (&mut TestEnvironment, RetrievedNote<MockNote>) {
    let (env, retrieved_note) = create_note();

    let context = &mut env.private();

    // We sanity check that we are building block 3, thus block 3 is where the note will be nullified.
    assert_eq(env.next_block_number(), NOTE_NULLIFIED_AT);

    destroy_note(context, retrieved_note, NOTE_STORAGE_SLOT);

    env.mine_block();

    (env, retrieved_note)
}
