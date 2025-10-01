use crate::Token;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_account_contracts {
        let owner = env.create_contract_account();
        let recipient = env.create_contract_account();
        (owner, recipient)
    } else {
        let owner = env.create_light_account();
        let recipient = env.create_light_account();

        (owner, recipient)
    };

    // Deploy token contract
    let initializer_call_interface = Token::interface().constructor(
        owner,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18,
    );
    let token_contract_address =
        env.deploy("Token").with_public_initializer(owner, initializer_call_interface);
    (env, token_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint_to_public(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    // Setup
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);
    let mint_amount = 10000 as u128;

    // Mint some tokens
    env.call_public(owner, Token::at(token_contract_address).mint_to_public(owner, mint_amount));

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_amount_to_private(
    with_account_contracts: bool,
    mint_amount: u128,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    // Setup the tokens and mint public balance
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);

    // Mint some tokens
    env.call_private(owner, Token::at(token_contract_address).mint_to_private(owner, mint_amount));

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_to_private(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    let mint_amount = 10000 as u128;
    setup_and_mint_amount_to_private(with_account_contracts, mint_amount)
}

pub unconstrained fn check_public_balance(
    env: TestEnvironment,
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    assert_eq(
        env.view_public(Token::at(token_contract_address).balance_of_public(address)),
        address_amount,
    );
}

pub unconstrained fn check_private_balance(
    env: TestEnvironment,
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    assert_eq(
        env.simulate_utility(Token::at(token_contract_address).balance_of_private(address)),
        address_amount,
    );
}
