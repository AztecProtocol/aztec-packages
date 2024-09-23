use crate::test::utils;
use dep::token::Token;
use crate::Lending;
use dep::authwit::cheatcodes as authwit_cheatcodes;

use dep::aztec::{prelude::AztecAddress, oracle::{unsafe_rand::unsafe_rand, execution::{get_chain_id, get_version, get_contract_address}}, test::helpers::cheatcodes};

#[test]
fn main() {
    let (
      env,
      price_feed_contract_address,
      asset_token_contract_address,
      stable_token_contract_address,
      lending_contract_address,
      account_1,
      account_2
    ) = utils::setup();
    env.impersonate(account_1);

    env.call_private_void(Token::at(asset_token_contract_address).privately_mint_private_note(10000));
    env.advance_block_by(1);

    env.call_private_void(Token::at(stable_token_contract_address).privately_mint_private_note(10000));
    env.advance_block_by(1);

    env.call_public(Token::at(asset_token_contract_address).mint_public(account_1, 10000));
    env.advance_block_by(1);

    env.call_public(Token::at(stable_token_contract_address).mint_public(account_1, 10000));
    env.advance_block_by(1);

    let mut bal = env.call_unconstrained(asset_token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(bal, 10000);

    bal = env.call_unconstrained(stable_token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(bal, 10000);

    bal = env.call_public(Token::at(asset_token_contract_address).balance_of_public(account_1));
    assert_eq(bal, 10000);

    bal = env.call_public(Token::at(stable_token_contract_address).balance_of_public(account_1));
    assert_eq(bal, 10000);

    env.call_public(Lending::at(lending_contract_address).init(price_feed_contract_address, 8000, asset_token_contract_address, stable_token_contract_address));
    env.advance_block_by(1);

    let unshield_call_interface = Token::at(asset_token_contract_address).unshield(account_1, lending_contract_address, 420, 2348924);
    authwit_cheatcodes::add_private_authwit_from_call_interface(account_1, lending_contract_address, unshield_call_interface);
    // This fails when enqueueing the public call, removing the enqueue works, but commenting out all the lines in the enqueue function does not.
    // env.call_private_void(Lending::at(lending_contract_address).deposit_private(
    //   account_1,
    //   420,
    //   2348924,
    //   1234, //     lendingAccount.secret,
    //   0,
    //   asset_token_contract_address
    // ));
    // env.advance_block_by(1);
}
