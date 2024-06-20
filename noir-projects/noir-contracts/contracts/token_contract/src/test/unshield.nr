use crate::test::utils;
use crate::Token;

#[test]
unconstrained fn unshield() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) = utils::setup_and_mint(/* with_account_contracts */ false);
    let unshield_amount = 1000;
    let unshield_call_interface = Token::at(token_contract_address).unshield(owner, owner, unshield_amount, 0);
    env.call_private_void(unshield_call_interface);
    utils::check_public_balance(token_contract_address, owner, mint_amount + unshield_amount);
}
