use crate::{NestedUtility, SYNC_CALL_RESULT_SLOT, SYNC_UTILITY_TARGET_SLOT};
use aztec::{
    oracle::{call_utility_function::call_utility_function, capsules},
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::{
        CallPrivateOptions, ExecuteUtilityOptions, TestEnvironment, TestEnvironmentOptions, ViewPrivateOptions,
    },
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    setup_with_opts(TestEnvironmentOptions::new())
}

unconstrained fn setup_with_opts(
    options: TestEnvironmentOptions,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new_opts(options);
    let account = env.create_light_account();
    let addr_a = env.deploy("NestedUtility").without_initializer();
    let addr_b = env.deploy("NestedUtility").without_initializer();
    (env, account, addr_a, addr_b)
}

/// Seeds `sync_caller`'s sync-target capsule with `sync_call_target`, so that syncing `sync_caller` makes it call
/// `sync_call_target`'s `pow_utility`.
unconstrained fn setup_with_sync_call_target(
    options: TestEnvironmentOptions,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let (env, account, sync_caller, sync_call_target) = setup_with_opts(options);
    env.utility_context_at(sync_caller, |_context| {
        capsules::store(
            sync_caller,
            SYNC_UTILITY_TARGET_SLOT,
            sync_call_target,
            account,
        );
    });
    (env, account, sync_caller, sync_call_target)
}

/// Makes a cross-contract utility call to `pow_utility` on `target`, forcing `target` to be synced first.
unconstrained fn call_pow_on(target: AztecAddress) -> Field {
    let call = NestedUtility::at(target).pow_utility(2, 10);
    let return_values: [Field; 1] = call_utility_function(call.target_contract, call.selector, call.args);
    return_values[0]
}

/// Returns the result recorded by `sync_caller`'s sync hook after its cross-contract call, or none if it never ran.
unconstrained fn read_sync_call_result(
    env: TestEnvironment,
    sync_caller: AztecAddress,
    scope: AztecAddress,
) -> Option<Field> {
    env.utility_context_at(sync_caller, |_context| capsules::load(sync_caller, SYNC_CALL_RESULT_SLOT, scope))
}

#[test]
unconstrained fn same_contract_utility_call_from_utility_succeeds() {
    let (env, _, addr_a, _) = setup();

    let result: Field = env.execute_utility(NestedUtility::at(addr_a).pow_utility(2, 10));
    assert_eq(result, 1024);
}

#[test]
unconstrained fn same_contract_utility_call_from_private_succeeds() {
    let (env, account, addr_a, _) = setup();

    let result: Field = env.call_private(account, NestedUtility::at(addr_a).pow_private(2, 10));
    assert_eq(result, 1024);
}

#[test(should_fail_with = "Cross-contract utility call denied")]
unconstrained fn cross_contract_utility_call_from_utility_denied_by_default() {
    let (env, _, addr_a, addr_b) = setup();

    let _: Field = env.execute_utility(NestedUtility::at(addr_a).delegate_pow_utility(addr_b, 2, 3));
}

#[test(should_fail_with = "Cross-contract utility call denied")]
unconstrained fn cross_contract_utility_call_from_private_denied_by_default() {
    let (env, account, addr_a, addr_b) = setup();

    let _: Field = env.call_private(account, NestedUtility::at(addr_a).delegate_pow_private(addr_b, 2, 3));
}

#[test]
unconstrained fn cross_contract_utility_call_from_utility_succeeds_with_authorization() {
    let (env, _, addr_a, addr_b) = setup();

    let result: Field = env.execute_utility_opts(
        ExecuteUtilityOptions::new().with_authorized_utility_call_targets([addr_b]),
        NestedUtility::at(addr_a).delegate_pow_utility(addr_b, 2, 3),
    );
    assert_eq(result, 8);
}

#[test]
unconstrained fn cross_contract_utility_call_from_private_succeeds_with_authorization() {
    let (env, account, addr_a, addr_b) = setup();

    let result: Field = env.call_private_opts(
        account,
        CallPrivateOptions::new().with_authorized_utility_call_targets([addr_b]),
        NestedUtility::at(addr_a).delegate_pow_private(addr_b, 2, 3),
    );
    assert_eq(result, 8);
}

#[test(should_fail_with = "Cross-contract utility call denied")]
unconstrained fn cross_contract_utility_call_from_private_view_denied_by_default() {
    let (env, account, addr_a, addr_b) = setup();

    let _: Field = env.view_private_opts(
        account,
        ViewPrivateOptions::new(),
        NestedUtility::at(addr_a).delegate_pow_view(addr_b, 2, 3),
    );
}

#[test]
unconstrained fn cross_contract_utility_call_from_private_view_succeeds_with_authorization() {
    let (env, account, addr_a, addr_b) = setup();

    let result: Field = env.view_private_opts(
        account,
        ViewPrivateOptions::new().with_authorized_utility_call_targets([addr_b]),
        NestedUtility::at(addr_a).delegate_pow_view(addr_b, 2, 3),
    );
    assert_eq(result, 8);
}

#[test]
unconstrained fn all_call_types_succeed_with_all_utility_call_targets_authorized() {
    let (env, account, addr_a, addr_b) = setup_with_opts(TestEnvironmentOptions::new()
        .with_all_utility_call_targets_authorized());

    let utility_result = env.execute_utility(NestedUtility::at(addr_a).delegate_pow_utility(addr_b, 2, 3));
    assert_eq(utility_result, 8);

    let private_result = env.call_private(account, NestedUtility::at(addr_a).delegate_pow_private(addr_b, 2, 3));
    assert_eq(private_result, 8);

    let view_result = env.view_private(account, NestedUtility::at(addr_a).delegate_pow_view(addr_b, 2, 3));
    assert_eq(view_result, 8);
}

#[test]
unconstrained fn sync_state_call_succeeds_in_utility_context_with_all_utility_call_targets_authorized() {
    let (env, account, sync_caller, sync_call_target) = setup_with_sync_call_target(TestEnvironmentOptions::new()
        .with_all_utility_call_targets_authorized());

    let result = env.utility_context_at(sync_call_target, |_context| call_pow_on(sync_caller));

    assert_eq(result, 1024);
    assert_eq(read_sync_call_result(env, sync_caller, account), Option::some(8));
}

#[test]
unconstrained fn sync_state_call_succeeds_in_private_context_with_all_utility_call_targets_authorized() {
    let (env, account, sync_caller, sync_call_target) = setup_with_sync_call_target(TestEnvironmentOptions::new()
        .with_all_utility_call_targets_authorized());

    let result = env.private_context_at(sync_call_target, |_context| call_pow_on(sync_caller));

    assert_eq(result, 1024);
    assert_eq(read_sync_call_result(env, sync_caller, account), Option::some(8));
}

#[test(should_fail_with = "Cross-contract utility call denied")]
unconstrained fn sync_state_call_denied_by_default() {
    let (env, _, sync_caller, sync_call_target) = setup_with_sync_call_target(TestEnvironmentOptions::new());

    let _ = env.utility_context_at(sync_call_target, |_context| call_pow_on(sync_caller));
}

#[test]
unconstrained fn top_level_utility_observes_no_caller_by_default() {
    let (env, _, addr_a, _) = setup();

    let result = env.execute_utility(NestedUtility::at(addr_a).get_msg_sender());
    assert_eq(result, Option::none());
}

#[test]
unconstrained fn with_from_sets_observed_msg_sender() {
    let (env, _, addr_a, _) = setup();
    let caller = AztecAddress::from_field(42);

    let result = env.execute_utility_opts(
        ExecuteUtilityOptions::new().with_from(caller),
        NestedUtility::at(addr_a).get_msg_sender(),
    );
    assert_eq(result, Option::some(caller));
}

#[test]
unconstrained fn cross_contract_utility_call_observes_calling_contract_as_msg_sender() {
    let (env, _, addr_a, addr_b) = setup();

    let result = env.execute_utility_opts(
        ExecuteUtilityOptions::new().with_authorized_utility_call_targets([addr_b]),
        NestedUtility::at(addr_a).delegate_get_msg_sender(addr_b),
    );
    assert_eq(result, Option::some(addr_a));
}
