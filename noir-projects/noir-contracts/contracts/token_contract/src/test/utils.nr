use crate::Token;
use dep::uint_note::uint_note::UintNote;
use aztec::{
    oracle::{
        execution::{get_block_number, get_contract_address},
        random::random,
        storage::storage_read,
    },
    prelude::{AztecAddress, NoteHeader},
    protocol_types::storage::map::derive_storage_slot_in_map,
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
};
use std::test::OracleMock;

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

pub unconstrained fn setup_and_mint_to_public(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);
    let mint_amount = 10000;
    // Mint some tokens
    Token::at(token_contract_address).mint_to_public(owner, mint_amount).call(&mut env.public());

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_amount_to_private(
    with_account_contracts: bool,
    mint_amount: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup the tokens and mint public balance
    let (env, token_contract_address, owner, recipient) = setup(with_account_contracts);

    // Mint some tokens
    mint_to_private(env, token_contract_address, owner, mint_amount);

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub unconstrained fn setup_and_mint_to_private(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    setup_and_mint_amount_to_private(with_account_contracts, 10000)
}

pub unconstrained fn mint_to_private(
    env: &mut TestEnvironment,
    token_contract_address: AztecAddress,
    recipient: AztecAddress,
    amount: Field,
) {
    let note_randomness = random();
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    let from = recipient; // we are setting from to recipient because of TODO(#9887)
    Token::at(token_contract_address).mint_to_private(from, recipient, amount).call(
        &mut env.private(),
    );
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
