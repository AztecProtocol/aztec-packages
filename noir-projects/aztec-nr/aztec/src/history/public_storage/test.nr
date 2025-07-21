use crate::{
    history::public_storage::PublicStorageHistoricalRead, oracle::execution::get_contract_address,
    test::helpers::test_environment::TestEnvironment,
};

global STORAGE_SLOT: Field = 420;
global VALUE: Field = 69;
global WRITTEN_TO_STORAGE_AT: u32 = 2;
global STORAGE_UNSET_VALUE: Field = 0;

unconstrained fn setup() -> &mut TestEnvironment {
    let mut env = TestEnvironment::new();
    let context = &mut env.public();

    // We sanity check that we are building block 2, and thus block 2 is where the following storage write will occur.
    assert_eq(env.next_block_number(), WRITTEN_TO_STORAGE_AT);

    context.storage_write(STORAGE_SLOT, VALUE);

    env.mine_block();

    &mut env
}

// In this test, we see our public value is set to what we specified at the block after the public write occurs.
#[test]
unconstrained fn public_storage_read() {
    let env = setup();

    let context = &mut env.private_at(WRITTEN_TO_STORAGE_AT);

    assert_eq(
        context.historical_header.public_storage_historical_read(
            STORAGE_SLOT,
            get_contract_address(),
        ),
        VALUE,
    );
}

// In this test, we see our public value is unset at the block before the public write occurs.
#[test]
unconstrained fn public_storage_read_empty() {
    let env = setup();

    let context = &mut env.private_at(WRITTEN_TO_STORAGE_AT - 1);

    assert_eq(
        context.historical_header.public_storage_historical_read(
            STORAGE_SLOT,
            get_contract_address(),
        ),
        STORAGE_UNSET_VALUE,
    );
}
