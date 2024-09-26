use crate::Escrow;
use dep::token::Token;

use dep::aztec::{
    prelude::AztecAddress, test::helpers::{test_environment::TestEnvironment, utils},
};

global MINT_AMOUNT = 200000;

unconstrained fn deploy_contracts(
    env: &mut TestEnvironment,
    admin_and_owner: AztecAddress,
) -> (AztecAddress, AztecAddress) {
    env.impersonate(admin_and_owner);

    // Deploy token contract
    let donation_token_initializer_call_interface = Token::interface().constructor(
        admin_and_owner,
        "Token00000000000000000000000000",
        "TKN0000000000000000000000000000",
        18
    );
    let donation_token_contract = env.deploy("./@token_contract", "Token").with_public_initializer(donation_token_initializer_call_interface);
    let token_contract_address = donation_token_contract.to_address();
    env.advance_block_by(1);

    // Deploy Escrow contract with public keys
    let escrow_contract_initializer_call_interface = Escrow::interface().constructor(
      admin_and_owner,
    );
    let escrow_contract = env.deploy_with_keys("./@escrow_contract", "Escrow", 6969).with_private_initializer(escrow_contract_initializer_call_interface);
    let escrow_contract_address = escrow_contract.to_address();

    env.advance_block_by(1);

    env.call_private_void(Token::at(token_contract_address).privately_mint_private_note(MINT_AMOUNT));
    env.advance_block_by(1);

    let private_balance_after_mint = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(admin_and_owner) });
    assert_eq(private_balance_after_mint, MINT_AMOUNT);

    (token_contract_address, escrow_contract_address)
}

#[test]
unconstrained fn main() {
    let (
      env,
      (account_1, account_2)
    ) = utils::setup(true, true);

    let (token_contract_address, escrow_contract_address) = deploy_contracts(env, account_1);

    // We transfer tokens to the escrow contract
    let TRANSFER_AMOUNT = 20000;
    env.call_private_void(Token::at(token_contract_address).transfer(escrow_contract_address, TRANSFER_AMOUNT));
    env.advance_block_by(1);

    let balance_of_account_after_transfer = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(balance_of_account_after_transfer, MINT_AMOUNT - TRANSFER_AMOUNT);

    let balance_of_escrow_after_transfer = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(escrow_contract_address) });
    assert_eq(balance_of_escrow_after_transfer, TRANSFER_AMOUNT);

    // We then withdraw some escrowed funds to account_2
    let balance_of_account_2_before_withdrawal = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_2) });
    assert_eq(balance_of_account_2_before_withdrawal, 0);

    let WITHDRAWAL_AMOUNT = 69;

    env.call_private_void(Escrow::at(escrow_contract_address).withdraw(token_contract_address, WITHDRAWAL_AMOUNT, account_2));
    env.advance_block_by(1);

    let balance_of_account_2_after_withdrawal = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_2) });
    assert_eq(balance_of_account_2_after_withdrawal, WITHDRAWAL_AMOUNT);

    let balance_of_escrow_after_withdrawal = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(escrow_contract_address) });
    assert_eq(balance_of_escrow_after_withdrawal, TRANSFER_AMOUNT - WITHDRAWAL_AMOUNT);

    // We test that withdrawal with an unauthorized user fails.
    env.impersonate(account_2);
    env.assert_private_call_fails(Escrow::at(escrow_contract_address).withdraw(token_contract_address, 69, account_2));
}

#[test]
unconstrained fn multi_1011() {
    let (
      env,
      (account_1, account_2)
    ) = utils::setup(true, true);

    let (token_contract_address, escrow_contract_address) = deploy_contracts(env, account_1);

    // We transfer tokens to the escrow contract
    let TRANSFER_AMOUNT = 20000;
    env.call_private_void(Token::at(token_contract_address).transfer(escrow_contract_address, TRANSFER_AMOUNT));
    env.advance_block_by(1);

    let balance_of_account_after_transfer = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(balance_of_account_after_transfer, MINT_AMOUNT - TRANSFER_AMOUNT);

    let balance_of_escrow_after_transfer = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(escrow_contract_address) });
    assert_eq(balance_of_escrow_after_transfer, TRANSFER_AMOUNT);

    // We then withdraw some escrowed funds to account_2
    let balance_of_account_2_before_withdrawal = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_2) });
    assert_eq(balance_of_account_2_before_withdrawal, 0);

    let WITHDRAWAL_AMOUNT = 69;
    let SECOND_TRANSFER_AMOUNT = 690;

    // This may not be a good approximation of a batch call.
    env.call_private_void(Token::at(token_contract_address).transfer(account_2, SECOND_TRANSFER_AMOUNT));
    env.call_private_void(Escrow::at(escrow_contract_address).withdraw(token_contract_address, WITHDRAWAL_AMOUNT, account_2));
    env.advance_block_by(1);

    let balance_of_account_1 = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(balance_of_account_1, MINT_AMOUNT - TRANSFER_AMOUNT - SECOND_TRANSFER_AMOUNT);

    let balance_of_account_2 = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(account_2) });
    assert_eq(balance_of_account_2, WITHDRAWAL_AMOUNT + SECOND_TRANSFER_AMOUNT);

    let balance_of_escrow = env.call_unconstrained(token_contract_address, || { Token::balance_of_private(escrow_contract_address) });
    assert_eq(balance_of_escrow, TRANSFER_AMOUNT - WITHDRAWAL_AMOUNT);

    // We test that withdrawal with an unauthorized user fails.
    env.impersonate(account_2);
    env.assert_private_call_fails(Escrow::at(escrow_contract_address).withdraw(token_contract_address, 69, account_2));
}
