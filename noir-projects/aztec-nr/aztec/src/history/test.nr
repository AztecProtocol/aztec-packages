use crate::{note::lifecycle::{create_note, destroy_note}, oracle::execution::get_contract_address};
use crate::note::retrieved_note::RetrievedNote;
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

// We create a note at block 2 and nullify it in the next block. This helps us test our historical apis.
pub(crate) unconstrained fn create_note_and_optionally_nullify_it(
    nullify_note: bool,
) -> (&mut TestEnvironment, RetrievedNote<MockNote>) {
    let mut env = TestEnvironment::new();
    let context = &mut env.private();

    let contract_address = get_contract_address();

    let retrieved_note = MockNote::new(69)
        .contract_address(contract_address)
        .nonce(0x256c00025f88d92eb518176c67c9d619b876e7261ef3ef5879fac1cf3b5acab2)
        .build_retrieved_note();

    let _ = create_note(context, 15, retrieved_note.note);

    // #TODO (12226): FIX
    // context.push_note_hash(retrieved_note.note.compute_note_hash(15));
    env.advance_block_by(1);

    if (nullify_note) {
        let context = &mut env.private();

        destroy_note(context, retrieved_note, 15);

        env.advance_block_by(1);
    }

    (&mut env, retrieved_note)
}
