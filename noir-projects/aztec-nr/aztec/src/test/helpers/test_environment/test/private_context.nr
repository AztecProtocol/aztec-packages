use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};
use protocol_types::{address::AztecAddress, traits::FromField};

#[test]
unconstrained fn at_sets_contract_address() {
    let mut env = TestEnvironment::_new();
    let contract_address = AztecAddress::from_field(17);

    env.private_context_at(contract_address, |context| {
        assert_eq(context.this_address(), contract_address);
    });
}

#[test]
unconstrained fn opts_sets_contract_address_and_historical_block_number() {
    let mut env = TestEnvironment::_new();

    env.mine_block();
    let historical_block_number = env.last_block_number() - 1;

    let contract_address = AztecAddress::from_field(17);

    env.private_context_opts(
        PrivateContextOptions::new().at_contract_address(contract_address),
        |context| { assert_eq(context.this_address(), contract_address); },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_historical_block_number(historical_block_number),
        |context| {
            assert_eq(
                context.get_block_header().global_variables.block_number,
                historical_block_number,
            );
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new()
            .at_contract_address(contract_address)
            .at_historical_block_number(historical_block_number),
        |context| {
            assert_eq(context.this_address(), contract_address);
            assert_eq(
                context.get_block_header().global_variables.block_number,
                historical_block_number,
            );
        },
    );
}
