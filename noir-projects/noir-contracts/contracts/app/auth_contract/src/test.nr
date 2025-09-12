use crate::Auth;

use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();
    let to_authorize = env.create_light_account();
    let other = env.create_light_account();

    let initializer_call_interface = Auth::interface().constructor(admin);

    let auth_contract_address =
        env.deploy("Auth").with_public_initializer(admin, initializer_call_interface);

    (env, auth_contract_address, admin, to_authorize, other)
}

#[test]
unconstrained fn authorized_initially_unset() {
    let (env, auth_contract_address, _, _, _) = setup();
    let auth = Auth::at(auth_contract_address);

    assert_eq(env.view_public(auth.get_authorized()), std::mem::zeroed());
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn non_admin_cannot_set_unauthorized() {
    let (env, auth_contract_address, _, _, other) = setup();
    let auth = Auth::at(auth_contract_address);

    env.call_public(other, auth.set_authorized(other));
}

#[test(should_fail_with = "caller is not authorized")]
unconstrained fn non_authorized_cannot_do_authorized_thing() {
    let (env, auth_contract_address, _, _, other) = setup();
    let auth = Auth::at(auth_contract_address);

    env.call_private(other, auth.do_private_authorized_thing());
}

#[test]
unconstrained fn admin_can_schedule_set_authorized() {
    let (env, auth_contract_address, admin, to_authorize, _) = setup();
    let auth = Auth::at(auth_contract_address);

    env.call_public(admin, auth.set_authorized(to_authorize));

    let (scheduled_authorized, timestamp_of_change) =
        env.view_public(auth.get_scheduled_authorized());
    assert_eq(scheduled_authorized, to_authorize);
    assert_eq(timestamp_of_change, env.last_block_timestamp() + Auth::CHANGE_AUTHORIZED_DELAY);
}

#[test]
unconstrained fn scheduled_authorized_is_not_immediately_effective() {
    let (env, auth_contract_address, admin, to_authorize, _) = setup();
    let auth = Auth::at(auth_contract_address);

    env.call_public(admin, auth.set_authorized(to_authorize));
    let (_, timestamp_of_change) = env.view_public(auth.get_scheduled_authorized());

    env.set_next_block_timestamp(timestamp_of_change - 1);
    assert_eq(env.view_public(auth.get_authorized()), std::mem::zeroed());
}

#[test]
unconstrained fn scheduled_authorized_becomes_effective_after_delay() {
    let (env, auth_contract_address, admin, to_authorize, _) = setup();
    let auth = Auth::at(auth_contract_address);

    env.call_public(admin, auth.set_authorized(to_authorize));
    let (_, timestamp_of_change) = env.view_public(auth.get_scheduled_authorized());

    env.mine_block_at(timestamp_of_change);

    assert_eq(env.view_public(auth.get_authorized()), to_authorize);
    assert_eq(env.view_private(auth.get_authorized_in_private()), to_authorize);

    env.call_private(to_authorize, auth.do_private_authorized_thing());
}
