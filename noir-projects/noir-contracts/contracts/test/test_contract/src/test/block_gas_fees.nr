use crate::Test;
use aztec::{protocol::abis::gas_fees::GasFees, test::helpers::test_environment::TestEnvironment};

global CUSTOM_FEES: GasFees = GasFees { fee_per_da_gas: 7, fee_per_l2_gas: 11 };

#[test]
unconstrained fn default_block_gas_fees_are_zero() {
    // Documents the (intentional) default. If this changes, every TXE test that previously read
    // `min_fee_per_l2_gas` / `min_fee_per_da_gas` had its semantics change too.
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    let observed: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());

    assert_eq(observed[0], 0, "default min_fee_per_da_gas should be zero");
    assert_eq(observed[1], 0, "default min_fee_per_l2_gas should be zero");
}

#[test]
unconstrained fn set_block_gas_fees_propagates_to_call_public() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_block_gas_fees(CUSTOM_FEES);
    let observed: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());

    assert_eq(observed[0], CUSTOM_FEES.fee_per_da_gas);
    assert_eq(observed[1], CUSTOM_FEES.fee_per_l2_gas);
}

#[test]
unconstrained fn set_block_gas_fees_persists_across_call_public_invocations() {
    // Mirrors `set_next_block_timestamp` semantics: the value sticks until overwritten.
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_block_gas_fees(CUSTOM_FEES);

    let first: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());
    let second: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());

    assert_eq(first[0], CUSTOM_FEES.fee_per_da_gas);
    assert_eq(first[1], CUSTOM_FEES.fee_per_l2_gas);
    assert_eq(second[0], CUSTOM_FEES.fee_per_da_gas);
    assert_eq(second[1], CUSTOM_FEES.fee_per_l2_gas);
}

#[test]
unconstrained fn set_block_gas_fees_can_be_overwritten() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_block_gas_fees(CUSTOM_FEES);
    let _: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());

    let other_fees = GasFees { fee_per_da_gas: 13, fee_per_l2_gas: 17 };
    env.set_block_gas_fees(other_fees);

    let observed: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());
    assert_eq(observed[0], other_fees.fee_per_da_gas);
    assert_eq(observed[1], other_fees.fee_per_l2_gas);
}

#[test]
unconstrained fn set_block_gas_fees_is_independent_of_set_gas_settings() {
    // The two setters configure independent pieces of state - `set_gas_settings` writes to the
    // private-side `tx_context.gas_settings`, `set_block_gas_fees` writes to the public-side
    // `globals.gas_fees`. Neither one bleeds into the other.
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_block_gas_fees(CUSTOM_FEES);

    // The private-side `context.gas_settings()` should still reflect the (untouched) default,
    // not the configured block fees.
    let private_observed = env.call_private(sender, test_contract.echo_gas_settings());
    assert(
        private_observed.max_fees_per_gas.is_empty(),
        "set_block_gas_fees must not affect tx_context.gas_settings.max_fees_per_gas",
    );

    // The public-side `min_fee_per_*_gas()` should reflect the configured block fees.
    let public_observed: [u128; 2] = env.call_public(sender, test_contract.echo_block_gas_fees());
    assert_eq(public_observed[0], CUSTOM_FEES.fee_per_da_gas);
    assert_eq(public_observed[1], CUSTOM_FEES.fee_per_l2_gas);
}
