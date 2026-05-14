use crate::oracle::nullifiers::check_nullifier_exists;
use crate::protocol::{
    abis::{function_selector::FunctionSelector, gas::Gas, gas_fees::GasFees, gas_settings::GasSettings},
    address::AztecAddress,
    constants::{MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS},
    traits::FromField,
};
use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};

#[test]
unconstrained fn at_sets_contract_address() {
    let env = TestEnvironment::new();
    let contract_address = AztecAddress::from_field(17);

    env.private_context_at(contract_address, |context| { assert_eq(context.this_address(), contract_address); });
}

#[test]
unconstrained fn opts_sets_contract_address_and_anchor_block_number() {
    let env = TestEnvironment::new();

    env.mine_block();
    let anchor_block_number = env.last_block_number() - 1;

    let contract_address = AztecAddress::from_field(17);

    env.private_context_opts(PrivateContextOptions::new().at_contract_address(contract_address), |context| {
        assert_eq(context.this_address(), contract_address);
    });

    env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(anchor_block_number), |context| {
        assert_eq(context.get_anchor_block_header().block_number(), anchor_block_number);
    });

    env.private_context_opts(
        PrivateContextOptions::new().at_contract_address(contract_address).at_anchor_block_number(anchor_block_number),
        |context| {
            assert_eq(context.this_address(), contract_address);
            assert_eq(context.get_anchor_block_header().block_number(), anchor_block_number);
        },
    );
}

#[test]
unconstrained fn default_gas_settings_match_protocol_max() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let gas_settings = context.gas_settings();
        assert_eq(
            gas_settings.gas_limits,
            Gas::new(
                MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
                MAX_PROCESSABLE_L2_GAS,
            ),
        );
        assert_eq(
            gas_settings.teardown_gas_limits,
            Gas::new(
                MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 8,
                MAX_PROCESSABLE_L2_GAS / 8,
            ),
        );
        assert_eq(gas_settings.max_fees_per_gas, GasFees::new(0, 0));
        assert_eq(gas_settings.max_priority_fees_per_gas, GasFees::new(0, 0));
    });
}

#[test]
unconstrained fn opts_sets_individual_gas_fields() {
    let env = TestEnvironment::new();

    let gas_limits = Gas::new(123_456, 789_012);
    let teardown_gas_limits = Gas::new(1_111, 2_222);
    let max_fees_per_gas = GasFees::new(7, 11);
    let max_priority_fees_per_gas = GasFees::new(3, 5);

    env.private_context_opts(PrivateContextOptions::new().with_gas_limits(gas_limits), |context| {
        assert_eq(context.gas_settings().gas_limits, gas_limits);
    });

    env.private_context_opts(PrivateContextOptions::new().with_teardown_gas_limits(teardown_gas_limits), |context| {
        assert_eq(context.gas_settings().teardown_gas_limits, teardown_gas_limits);
    });

    env.private_context_opts(PrivateContextOptions::new().with_max_fees_per_gas(max_fees_per_gas), |context| {
        assert_eq(context.gas_settings().max_fees_per_gas, max_fees_per_gas);
    });

    env.private_context_opts(
        PrivateContextOptions::new().with_max_priority_fees_per_gas(max_priority_fees_per_gas),
        |context| { assert_eq(context.gas_settings().max_priority_fees_per_gas, max_priority_fees_per_gas); },
    );
}

#[test]
unconstrained fn opts_with_gas_settings_sets_all_fields() {
    let env = TestEnvironment::new();

    let gas_settings = GasSettings::new(
        Gas::new(123_456, 789_012),
        Gas::new(1_111, 2_222),
        GasFees::new(7, 11),
        GasFees::new(3, 5),
    );

    env.private_context_opts(PrivateContextOptions::new().with_gas_settings(gas_settings), |context| {
        assert_eq(context.gas_settings(), gas_settings);
    });
}

#[test]
unconstrained fn uses_last_block_number() {
    let env = TestEnvironment::new();

    let last_block_number = env.last_block_number();

    env.private_context(|context| { assert_eq(last_block_number, context.get_anchor_block_header().block_number()); });
}

#[test]
unconstrained fn advances_block_number() {
    let env = TestEnvironment::new();

    let first_block_number = env.private_context(|context| context.get_anchor_block_header().block_number());
    let second_block_number = env.private_context(|context| context.get_anchor_block_header().block_number());

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn does_not_advance_the_timestamp() {
    let env = TestEnvironment::new();

    env.private_context(|_| {});
    let first_timestamp = env.last_block_timestamp();
    env.private_context(|_| {});
    let second_timestamp = env.last_block_timestamp();

    assert_eq(second_timestamp, first_timestamp);
}

#[test(should_fail_with = "Duplicate siloed nullifier")]
unconstrained fn rejects_duplicate_transient_nullifiers() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        context.push_nullifier(1);
        context.push_nullifier(1);
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn rejects_duplicate_settled_nullifiers() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(1); });

    env.private_context(|context| { context.push_nullifier(1); });
}

#[test]
unconstrained fn repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.private_context(|context| context.this_address());
    let second_address = env.private_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test(should_fail_with = "Contract calls are forbidden")]
unconstrained fn private_call_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ = context.call_private_function_no_args(AztecAddress::zero(), FunctionSelector::zero());
    });
}

#[test(should_fail_with = "Enqueueing public calls is not supported")]
unconstrained fn public_call_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ = context.call_public_function_no_args(AztecAddress::zero(), FunctionSelector::zero(), false);
    });
}

#[test(should_fail_with = "Enqueueing public calls is not supported")]
unconstrained fn set_teardown_fails() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let _ = context.set_public_teardown_function(AztecAddress::zero(), FunctionSelector::zero(), [], false);
    });
}

#[test]
unconstrained fn check_nullifier_exists_nonexistent() {
    let env = TestEnvironment::new();

    env.private_context(|_| { assert(!check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_settled() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(1); });

    env.private_context(|_| { assert(check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        context.push_nullifier(1);
        assert(check_nullifier_exists(1));
    });
}
