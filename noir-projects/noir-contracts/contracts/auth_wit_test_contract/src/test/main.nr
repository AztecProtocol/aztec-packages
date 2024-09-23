use crate::test::utils;
use crate::AuthWitTest;

use dep::schnorr_account_contract::SchnorrAccount;
use dep::auth_registry_contract::AuthRegistry;

use dep::aztec::{oracle::{unsafe_rand::unsafe_rand, execution::{get_chain_id, get_version}}, test::helpers::cheatcodes};
use dep::authwit::{auth::{compute_inner_authwit_hash, compute_authwit_message_hash, IS_VALID_SELECTOR}, cheatcodes::set_public_authwit_from_inner_hash};
use protocol_types::constants::CANONICAL_AUTH_REGISTRY_ADDRESS;

#[test]
fn private_authwit_flow() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, get_chain_id(), get_version(), inner_hash);
    cheatcodes::add_authwit(account_1, message_hash);

    let authwit_valid_for_account_1 = env.call_unconstrained(account_1, || { SchnorrAccount::lookup_validity(authwit_test_contract_address, inner_hash) });
    assert_eq(authwit_valid_for_account_1, true);

    let authwit_valid_for_account_2 =  env.call_unconstrained(account_2, || { SchnorrAccount::lookup_validity(authwit_test_contract_address, inner_hash) });
    assert_eq(authwit_valid_for_account_2, false);

    env.impersonate(account_2);
    env.call_private_void(AuthWitTest::at(authwit_test_contract_address).consume(account_1, inner_hash));

    // Calls the function again
    env.assert_private_call_fails(AuthWitTest::at(authwit_test_contract_address).consume(account_1, inner_hash));
}

#[test(should_fail_with="Auth witness not found for message hash")]
fn private_wrong_chain_id_lookup_validity_fails() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0xbeef]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, unsafe_rand(), get_version(), inner_hash);

    cheatcodes::add_authwit(account_1, message_hash);

    env.call_unconstrained(account_1, || { SchnorrAccount::lookup_validity(authwit_test_contract_address, inner_hash) });
}

#[test(should_fail_with="Authorization not found for message hash")]
fn private_wrong_chain_id_consume_fails() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0xbeef]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, unsafe_rand(), get_version(), inner_hash);

    cheatcodes::add_authwit(account_1, message_hash);

    env.impersonate(account_2);
    env.call_private_void(AuthWitTest::at(authwit_test_contract_address).consume(account_1, inner_hash));
}

#[test(should_fail_with="Auth witness not found for message hash")]
fn private_wrong_version_lookup_validity_fails() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0xbeef]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, get_chain_id(), unsafe_rand(), inner_hash);

    cheatcodes::add_authwit(account_1, message_hash);

    env.call_unconstrained(account_1, || { SchnorrAccount::lookup_validity(authwit_test_contract_address, inner_hash) });
}

#[test(should_fail_with="Authorization not found for message hash")]
fn private_wrong_version_consume_fails() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0xbeef]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, get_chain_id(), unsafe_rand(), inner_hash);

    cheatcodes::add_authwit(account_1, message_hash);

    env.impersonate(account_2);
    env.call_private_void(AuthWitTest::at(authwit_test_contract_address).consume(account_1, inner_hash));
}

#[test]
unconstrained fn public_flow() {
    let (env, _, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0x01]);
    let message_hash = compute_authwit_message_hash(account_2, get_chain_id(), get_version(), inner_hash);

    let authwit_valid_for_account_1_before = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1_before, false);

    set_public_authwit_from_inner_hash(account_2, account_1, inner_hash, true);

    let authwit_valid_for_account_1 = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1, true);

    env.impersonate(account_2);
    let valid = env.call_public(AuthRegistry::at(CANONICAL_AUTH_REGISTRY_ADDRESS).consume(account_1, inner_hash));

    assert_eq(valid, IS_VALID_SELECTOR);

    let authwit_valid_for_account_1_after_consume = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1_after_consume, false);
}

#[test]
unconstrained fn public_flow_with_authwit_test_contract() {
    let (env, authwit_test_contract_address, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0x01]);
    let message_hash = compute_authwit_message_hash(authwit_test_contract_address, get_chain_id(), get_version(), inner_hash);

    let authwit_valid_for_account_1_before = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1_before, false);

    set_public_authwit_from_inner_hash(authwit_test_contract_address, account_1, inner_hash, true);

    let authwit_valid_for_account_1 = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1, true);

    env.impersonate(account_2);

    // TODO: Figure out why this fails with brillig panic
    // env.call_public(AuthWitTest::at(authwit_test_contract_address).consume_public(account_1, inner_hash));

    // let authwit_valid_for_account_1_after_consume = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    // assert_eq(authwit_valid_for_account_1_after_consume, false);
}

#[test(should_fail_with="unauthorized")]
unconstrained fn public_flow_with_unset() {
    let (env, _, account_1, account_2) = utils::setup();

    let inner_hash = compute_inner_authwit_hash([0xdead, 0x02]);
    let message_hash = compute_authwit_message_hash(account_2, get_chain_id(), get_version(), inner_hash);

    let authwit_valid_for_account_1_before = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1_before, false);

    set_public_authwit_from_inner_hash(account_2, account_1, inner_hash, true);

    let authwit_valid_for_account_1 = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1, true);

    set_public_authwit_from_inner_hash(account_2, account_1, inner_hash, false);

    let authwit_valid_for_account_1_before = env.call_unconstrained(CANONICAL_AUTH_REGISTRY_ADDRESS, || { AuthRegistry::unconstrained_is_consumable(account_1, message_hash) });
    assert_eq(authwit_valid_for_account_1_before, false);

    env.impersonate(account_2);
    env.call_public(AuthRegistry::at(CANONICAL_AUTH_REGISTRY_ADDRESS).consume(account_1, inner_hash)) as Field;
}
