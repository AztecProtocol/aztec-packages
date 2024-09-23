use dep::aztec::{
    prelude::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use crate::Crowdfunding;

use dep::token::Token;
use dep::claim::Claim;

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

    // Start the test in the account contract address
    env.impersonate(account_1);

    // Deploy token contract
    let donation_token_initializer_call_interface = Token::interface().constructor(
        account_1,
        "DonationToken000000000000000000",
        "DNT0000000000000000000000000000",
        18
    );
    let donation_token_contract = env.deploy("./@token_contract", "Token").with_public_initializer(donation_token_initializer_call_interface);
    let donation_token_contract_address = donation_token_contract.to_address();
    env.advance_block_by(1);

    // Deploy reward token
    let reward_token_initializer_call_interface = Token::interface().constructor(
        account_1,
        "RewardToken00000000000000000000",
        "RWD0000000000000000000000000000",
        18
    );
    let reward_token_contract = env.deploy("./@token_contract", "Token").with_public_initializer(reward_token_initializer_call_interface);
    let reward_token_contract_address = reward_token_contract.to_address();
    env.advance_block_by(1);

    // Deploy Crowdfunding contract with public keys
    let crowdfunding_initializer_call_interface = Crowdfunding::interface().init(
      donation_token_contract_address,
      account_1,
      3137976546,
    );
    let crowdfunding_contract = env.deploy_with_public_keys("./@crowdfunding_contract", "Crowdfunding", 6969).with_public_initializer(crowdfunding_initializer_call_interface);
    let crowdfunding_contract_address = crowdfunding_contract.to_address();

    assert(crowdfunding_contract_address.eq(AztecAddress::from_field(0x2f931814ecca22bc73bc91827315eab2d08f6c907e3dbbbfeb9fc670612ba31a)));
    env.advance_block_by(1);

    // Deploy Claim contract
    let claim_initializer_call_interface = Claim::interface().constructor(
      crowdfunding_contract_address,
      reward_token_contract_address,
    );
    let claim_contract = env.deploy("./@claim_contract", "Claim").with_public_initializer(claim_initializer_call_interface);
    let claim_contract_address = claim_contract.to_address();
    env.advance_block_by(1);

    env.call_public(Token::at(reward_token_contract_address).set_minter(claim_contract_address, true));
    env.advance_block_by(1);

    (
      &mut env,
      donation_token_contract_address,
      reward_token_contract_address,
      crowdfunding_contract_address,
      claim_contract_address,
      account_1,
      account_2
    )
}
