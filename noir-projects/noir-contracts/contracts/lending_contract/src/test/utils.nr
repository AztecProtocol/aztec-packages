use dep::aztec::{
    prelude::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use crate::Lending;
use dep::token::Token;
use dep::price_feed::PriceFeed;

pub fn setup() -> (
  &mut TestEnvironment,
  AztecAddress,
  AztecAddress,
  AztecAddress,
  AztecAddress,
  AztecAddress,
  AztecAddress
) {
    let mut env = TestEnvironment::new();
    let account_1 = env.create_account_contract(1);
    let account_2 = env.create_account_contract(2);
    env.impersonate(account_1);

    // Deploy canonical auth registry
    let _auth_registry = env.deploy("./@auth_registry_contract", "AuthRegistry").without_initializer();
    env.advance_block_by(1);

    // Deploy canonical auth registry
    let _router_contract = env.deploy("./@router_contract", "Router").without_initializer();
    env.advance_block_by(1);

    let price_feed_contract = env.deploy("./@price_feed_contract", "PriceFeed").without_initializer();
    let price_feed_contract_address = price_feed_contract.to_address();
    env.advance_block_by(1);

    env.call_public(PriceFeed::at(price_feed_contract_address).set_price(0, 2000000000));
    env.advance_block_by(1);

    // Deploy asset token contract
    let asset_token_initializer_call_interface = Token::interface().constructor(
        account_1,
        "DonationToken000000000000000000",
        "DNT0000000000000000000000000000",
        18
    );
    let asset_token_contract = env.deploy("./@token_contract", "Token").with_public_initializer(asset_token_initializer_call_interface);
    let asset_token_contract_address = asset_token_contract.to_address();
    env.advance_block_by(1);

    // Deploy stable token contract
    let stable_token_initializer_call_interface = Token::interface().constructor(
        account_1,
        "StableToken00000000000000000000",
        "STAB000000000000000000000000000",
        18
    );
    let stable_token_contract = env.deploy("./@token_contract", "Token").with_public_initializer(stable_token_initializer_call_interface);
    let stable_token_contract_address = stable_token_contract.to_address();
    env.advance_block_by(1);

    let lending_initializer_call_interface = Lending::interface().constructor();
    let lending_contract = env.deploy("./@lending_contract", "Lending").with_private_initializer(lending_initializer_call_interface);
    let lending_contract_address = lending_contract.to_address();
    env.advance_block_by(1);

    env.call_public(Token::at(asset_token_contract_address).set_minter(lending_contract_address, true));
    env.advance_block_by(1);

    env.call_public(Token::at(stable_token_contract_address).set_minter(lending_contract_address, true));
    env.advance_block_by(1);

    (
      &mut env,
      price_feed_contract_address,
      asset_token_contract_address,
      stable_token_contract_address,
      lending_contract_address,
      account_1,
      account_2
    )
}
