use crate::{
    history::public_storage::PublicStorageHistoricalRead,
    oracle::execution::get_contract_address,
    test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote},
};

unconstrained fn setup() -> &mut TestEnvironment {
    let mut env = TestEnvironment::new();
    let context = &mut env.public();

    context.storage_write(15, 69);

    env.advance_block_by(1);

    &mut env
}

#[test]
unconstrained fn public_storage_read() {
    let env = setup();

    let context = &mut env.private();

    assert_eq(
        context.historical_header.public_storage_historical_read(15, get_contract_address()),
        69,
    );
}

#[test]
unconstrained fn public_storage_read_empty() {
    let env = setup();

    let context = &mut env.private_at(1);

    assert_eq(
        context.historical_header.public_storage_historical_read(15, get_contract_address()),
        0,
    );
}
