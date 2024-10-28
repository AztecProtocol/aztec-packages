use dep::aztec::{
    hash::compute_secret_hash,
    oracle::{
        execution::{get_block_number, get_contract_address},
        random::random,
        storage::storage_read,
    },
    prelude::AztecAddress,
    protocol_types::storage::map::derive_storage_slot_in_map,
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
};

use crate::{Token, types::transparent_note::TransparentNote};

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
        let owner = env.create_account();
        let recipient = env.create_account();
        (owner, recipient)
    };

    // Start the test in the account contract address
    env.impersonate(owner);

    // Deploy token contract
    let initializer_call_interface = Token::interface().constructor(
        owner,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18,
    );
    let token_contract =
        env.deploy_self("Token").with_public_void_initializer(initializer_call_interface);
    let token_contract_address = token_contract.to_address();
    env.advance_block_by(1);
    (&mut env, token_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint_public(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);
    let mint_amount = 10000;
    // Mint some tokens
    Token::at(token_contract_address).mint_public(owner, mint_amount).call(&mut env.public());

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_private(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);
    let mint_amount = 10000;
    // Mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());

    // docs:start:txe_test_add_note
    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );
    // docs:end:txe_test_add_note
    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret).call(
        &mut env.private(),
    );

    (env, token_contract_address, owner, recipient, mint_amount)
}

// docs:start:txe_test_read_public
pub unconstrained fn check_public_balance(
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: Field,
) {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(token_contract_address);
    let block_number = get_block_number();

    let balances_slot = Token::storage_layout().public_balances.slot;
    let address_slot = derive_storage_slot_in_map(balances_slot, address);
    let amount: U128 = storage_read(token_contract_address, address_slot, block_number);
    assert(amount.to_field() == address_amount, "Public balance is not correct");
    cheatcodes::set_contract_address(current_contract_address);
}
// docs:end:txe_test_read_public

// docs:start:txe_test_call_unconstrained
pub unconstrained fn check_private_balance(
    token_contract_address: AztecAddress,
    address: AztecAddress,
    address_amount: Field,
) {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(token_contract_address);
    // Direct call to unconstrained
    let balance_of_private = Token::balance_of_private(address);
    assert(balance_of_private == address_amount, "Private balance is not correct");
    cheatcodes::set_contract_address(current_contract_address);
}
// docs:end:txe_test_call_unconstrained
