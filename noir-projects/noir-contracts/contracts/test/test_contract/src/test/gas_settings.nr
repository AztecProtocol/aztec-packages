use crate::Test;
use aztec::{
    protocol::abis::{gas::Gas, gas_fees::GasFees, gas_settings::GasSettings},
    test::helpers::test_environment::TestEnvironment,
};

global CUSTOM_SETTINGS: GasSettings = GasSettings {
    gas_limits: Gas { da_gas: 100, l2_gas: 200 },
    teardown_gas_limits: Gas { da_gas: 10, l2_gas: 20 },
    max_fees_per_gas: GasFees { fee_per_da_gas: 3, fee_per_l2_gas: 5 },
    max_priority_fees_per_gas: GasFees { fee_per_da_gas: 1, fee_per_l2_gas: 2 },
};

#[test]
unconstrained fn default_gas_settings_have_max_limits_and_zero_fees() {
    // Documents the (intentional) default: max processable gas limits, zero fees. If this assertion
    // changes, every TXE test that previously read `context.gas_settings()` had its semantics
    // change too.
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    let observed: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());

    assert(observed.gas_limits.da_gas != 0, "default da gas limit must be non-zero");
    assert(observed.gas_limits.l2_gas != 0, "default l2 gas limit must be non-zero");
    assert(
        observed.teardown_gas_limits.da_gas != 0,
        "default teardown da gas limit must be non-zero",
    );
    assert(
        observed.teardown_gas_limits.l2_gas != 0,
        "default teardown l2 gas limit must be non-zero",
    );
    assert(observed.max_fees_per_gas.is_empty(), "default max fees should be zero");
    assert(
        observed.max_priority_fees_per_gas.is_empty(),
        "default max priority fees should be zero",
    );
}

#[test]
unconstrained fn set_gas_settings_propagates_to_call_private() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_gas_settings(CUSTOM_SETTINGS);
    let observed: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());

    assert(observed.eq(CUSTOM_SETTINGS), "echoed gas settings should match configured value");
}

#[test]
unconstrained fn set_gas_settings_persists_across_call_private_invocations() {
    // The setter is not "consumed" by a single call - it persists like `set_next_block_timestamp`.
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_gas_settings(CUSTOM_SETTINGS);

    let first: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());
    let second: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());

    assert(first.eq(CUSTOM_SETTINGS));
    assert(second.eq(CUSTOM_SETTINGS));
}

#[test]
unconstrained fn set_gas_settings_can_be_overwritten() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());
    let test_contract = Test::at(contract_address);

    env.set_gas_settings(CUSTOM_SETTINGS);
    let _: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());

    let other_settings = GasSettings {
        gas_limits: Gas { da_gas: 999, l2_gas: 888 },
        teardown_gas_limits: Gas { da_gas: 7, l2_gas: 6 },
        max_fees_per_gas: GasFees { fee_per_da_gas: 11, fee_per_l2_gas: 12 },
        max_priority_fees_per_gas: GasFees { fee_per_da_gas: 4, fee_per_l2_gas: 3 },
    };
    env.set_gas_settings(other_settings);

    let observed: GasSettings = env.call_private(sender, test_contract.echo_gas_settings());
    assert(observed.eq(other_settings));
}

#[test]
unconstrained fn set_gas_settings_propagates_to_private_context_closure() {
    // The inline `private_context` closure should also see the configured GasSettings, since
    // `enterPrivateState` builds its TxContext from the same source-of-truth.
    let env = TestEnvironment::new();
    env.set_gas_settings(CUSTOM_SETTINGS);

    env.private_context(|context| {
        let observed = context.gas_settings();
        assert(
            observed.eq(CUSTOM_SETTINGS),
            "private_context should observe configured gas settings",
        );
    });
}
