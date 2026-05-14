use crate::context::{PrivateCall, PublicCall};
use crate::protocol::abis::{function_selector::FunctionSelector, gas::Gas, gas_settings::GasSettings};
use crate::protocol::address::AztecAddress;
use crate::protocol::constants::{MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS};
use crate::test::helpers::test_environment::{CallPrivateOptions, CallPublicOptions, TestEnvironment};

/// Path to the GasSettingsReader contract artifact in the noir-contracts workspace. Defined as a global because we
/// reference it from multiple tests; manual call construction (instead of importing the contract type and using
/// `GasSettingsReader::at(...)`) avoids the circular dependency that would otherwise arise between aztec-nr and a
/// contract that depends on aztec-nr.
global READER_PATH: str<65> = "../noir-contracts/@gas_settings_reader_contract/GasSettingsReader";

#[test]
unconstrained fn call_private_opts_propagates_gas_settings() {
    let mut env = TestEnvironment::new();
    let caller = env.create_light_account();
    let contract_addr = env.deploy(READER_PATH).without_initializer();

    // Note: we leave `max_fees_per_gas` and `max_priority_fees_per_gas` at their default zero values rather than
    // exercise them here. Non-zero fee fields trigger a fee charge on the caller during tx execution, but the
    // light-account caller has no fee juice balance. Asserting propagation of the fee fields through the call flow
    // would require funding the caller.
    let gas_limits = Gas::new(123_456, 789_012);
    let teardown_gas_limits = Gas::new(1_111, 2_222);

    let call = PrivateCall::<_, _, GasSettings>::new(
        contract_addr,
        comptime { FunctionSelector::from_signature("read_gas_settings()") },
        "read_gas_settings",
        [],
    );

    let returned = env.call_private_opts(
        caller,
        CallPrivateOptions::new().with_gas_limits(gas_limits).with_teardown_gas_limits(teardown_gas_limits),
        call,
    );

    assert_eq(returned.gas_limits, gas_limits);
    assert_eq(returned.teardown_gas_limits, teardown_gas_limits);
}

/// Builds a `PublicCall` for `GasSettingsReader::read_public_gas_left`.
unconstrained fn read_public_gas_left_call(contract_addr: AztecAddress) -> PublicCall<20, 0, (u32, u32)> {
    PublicCall::<_, _, (u32, u32)>::new(
        contract_addr,
        comptime { FunctionSelector::from_signature("read_public_gas_left()") },
        "read_public_gas_left",
        [],
    )
}

#[test]
unconstrained fn call_public_opts_propagates_l2_gas_limit() {
    let mut env = TestEnvironment::new();
    let caller = env.create_light_account();
    let contract_addr = env.deploy(READER_PATH).without_initializer();

    let l2_gas_limit = 5_000_000;

    let (_, l2_gas_left) = env.call_public_opts(
        caller,
        CallPublicOptions::new().with_gas_limits(Gas::new(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, l2_gas_limit)),
        read_public_gas_left_call(contract_addr),
    );

    // The contract observes its remaining L2 gas after the AVM has charged for entering the function. That value must
    // sit strictly below the configured limit (the function must have spent at least one gas unit) and above zero.
    assert(l2_gas_left < l2_gas_limit);
    assert(l2_gas_left > 0);
}

#[test]
unconstrained fn call_public_opts_propagates_da_gas_limit() {
    let mut env = TestEnvironment::new();
    let caller = env.create_light_account();
    let contract_addr = env.deploy(READER_PATH).without_initializer();

    let da_gas_limit = 200_000;

    let (da_gas_left, _) = env.call_public_opts(
        caller,
        CallPublicOptions::new().with_gas_limits(Gas::new(da_gas_limit, MAX_PROCESSABLE_L2_GAS)),
        read_public_gas_left_call(contract_addr),
    );

    // The function consumes zero DA gas (it only reads a counter), so we only verify the configured limit was
    // honoured (`<= da_gas_limit`). The default `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` is much larger than
    // `da_gas_limit`, so this still proves the configured value flowed through.
    assert(da_gas_left <= da_gas_limit);
}
