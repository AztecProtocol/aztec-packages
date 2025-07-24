use crate::Token;
use aztec::{
    oracle::notes::set_sender_for_tags, protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_account_contracts {
        let owner = env.create_account_contract(1);
        let recipient = env.create_account_contract(2);
        (owner, recipient)
    } else {
        let owner = env.create_account(1);
        let recipient = env.create_account(2);

        // We are not deploying any account contracts and so we need to manually set the sender for tags. This is
        // usually done by account contract's entrypoint.
        let sender = env.create_account(7097070);
        set_sender_for_tags(sender);

        (owner, recipient)
    };

    // Deploy token contract
    let initializer_call_interface = Token::interface().constructor(
        owner,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18,
    );
    let token_contract =
        env.deploy_self("Token").with_public_void_initializer(owner, initializer_call_interface);
    let token_contract_address = token_contract.to_address();
    env.mine_block();
    (&mut env, token_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint_to_public(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    // Setup
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);
    let mint_amount = 10000 as u128;

    // Mint some tokens
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).mint_to_public(owner, mint_amount),
    );

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_amount_to_private(
    with_account_contracts: bool,
    mint_amount: u128,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    // Setup the tokens and mint public balance
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);

    // Mint some tokens
    let _ = env.call_private(
        owner,
        Token::at(token_contract_address).mint_to_private(owner, mint_amount),
    );

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_to_private(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, u128) {
    let mint_amount = 10000 as u128;
    setup_and_mint_amount_to_private(with_account_contracts, mint_amount)
}

// docs:start:txe_test_read_public
pub unconstrained fn check_public_balance(
    env: &mut TestEnvironment,
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    assert_eq(
        env.view_public(Token::at(token_contract_address).balance_of_public(address)),
        address_amount,
    );
}
// docs:end:txe_test_read_public

// docs:start:txe_test_call_utility
pub unconstrained fn check_private_balance(
    env: &mut TestEnvironment,
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: u128,
) {
    assert_eq(
        env.simulate_utility(Token::at(token_contract_address)._experimental_balance_of_private(
            address,
        )),
        address_amount,
    );
}
// docs:end:txe_test_call_utility
