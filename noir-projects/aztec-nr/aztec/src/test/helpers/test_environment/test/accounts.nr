use crate::{
    authwit::auth::{compute_authwit_message_hash, IS_VALID_SELECTOR},
    context::call_interfaces::PrivateCallInterface,
    keys::getters::get_public_keys,
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};
use protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};

#[test]
unconstrained fn create_light_account_does_not_repeat_accounts() {
    let mut env = TestEnvironment::new();

    let first_account = env.create_light_account();
    let second_account = env.create_light_account();

    assert(first_account != second_account);
}

#[test]
unconstrained fn create_contract_account_does_not_repeat_accounts() {
    let mut env = TestEnvironment::new();

    let first_account = env.create_contract_account();
    let second_account = env.create_contract_account();

    assert(first_account != second_account);
}

#[test]
unconstrained fn light_and_contract_accounts_do_not_share_addresses() {
    let mut env = TestEnvironment::new();

    let light_account = env.create_light_account();
    let contract_account = env.create_contract_account();

    assert(light_account != contract_account);
}

#[test]
unconstrained fn light_accounts_have_valid_keys() {
    let mut env = TestEnvironment::new();
    let light_account = env.create_light_account();

    env.utility_context(|_| { let _ = get_public_keys(light_account); });
}

#[test]
unconstrained fn contract_accounts_have_valid_keys() {
    let mut env = TestEnvironment::new();
    let contract_account = env.create_contract_account();

    env.utility_context(|_| { let _ = get_public_keys(contract_account); });
}

#[test(should_fail_with = "use `create_contract_account` instead of `create_light_account` for authwit support")]
unconstrained fn light_accounts_fail_on_private_authwit_checks() {
    let mut env = TestEnvironment::new();
    let light_account = env.create_light_account();

    let inner_hash = 13;
    let caller = AztecAddress::zero();

    env.call_private(
        caller,
        PrivateCallInterface::new(
            light_account,
            comptime { FunctionSelector::from_signature("verify_private_authwit(Field)") },
            "verify_private_authwit",
            [inner_hash],
            true,
        ),
    );
}

#[test(should_fail_with = "Unknown auth witness")]
unconstrained fn contract_accounts_reject_invalid_private_authwits() {
    let mut env = TestEnvironment::new();
    let contract_account = env.create_contract_account();

    let inner_hash = 13;
    let caller = AztecAddress::zero();

    env.call_private(
        caller,
        PrivateCallInterface::new(
            contract_account,
            comptime { FunctionSelector::from_signature("verify_private_authwit(Field)") },
            "verify_private_authwit",
            [inner_hash],
            true,
        ),
    );
}

#[test]
unconstrained fn contract_accounts_accept_valid_private_authwits() {
    let mut env = TestEnvironment::new();
    let contract_account = env.create_contract_account();

    let inner_hash = 13;
    let caller = AztecAddress::zero();

    let message_hash = env.private_context(|context| {
        compute_authwit_message_hash(caller, context.chain_id(), context.version(), inner_hash)
    });

    txe_oracles::add_authwit(contract_account, message_hash);

    let result = env.call_private(
        caller,
        PrivateCallInterface::new(
            contract_account,
            comptime { FunctionSelector::from_signature("verify_private_authwit(Field)") },
            "verify_private_authwit",
            [inner_hash],
            true,
        ),
    );
    assert_eq(result, IS_VALID_SELECTOR);
}
