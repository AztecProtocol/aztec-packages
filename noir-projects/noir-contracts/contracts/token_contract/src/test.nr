use dep::aztec::{hash::compute_secret_hash, prelude::AztecAddress};
use dep::aztec::test::helpers::{cheatcodes, test_environment::TestEnvironment};
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;
use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
use dep::aztec::note::note_viewer_options::NoteViewerOptions;
use crate::{types::{token_note::TokenNote, transparent_note::TransparentNote}, Token};

pub fn setup_and_mint() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account_contract(1);
    let recipient = env.create_account_contract(2);
    let mint_amount = 10000;

    // Start the test in the account contract address
    cheatcodes::set_contract_address(owner);

    // Deploy token contract
    let initializer_call_interface = Token::interface().constructor(
        owner,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18
    );
    let token_contract = env.deploy("@aztec/noir-contracts.js/Token").with_public_initializer(initializer_call_interface);
    let token_contract_address = token_contract.to_address();
    env.advance_block_by(1);

    // Mint some tokens
    let secret = 1;
    let secret_hash = compute_secret_hash(secret);
    let mint_private_call_interface = Token::at(token_contract_address).mint_private(mint_amount, secret_hash);
    env.call_public(mint_private_call_interface);

    // Time travel so we can read keys from the registry
    env.advance_block_by(6);

    // Store a note in the cache so we can redeem it
    env.store_note_in_cache(
        &mut TransparentNote::new(mint_amount, secret_hash),
        Token::storage().pending_shields.slot,
        token_contract_address
    );

    // Redeem our shielded tokens
    let redeem_shield_call_interface = Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret);
    env.call_private_void(redeem_shield_call_interface);

    // Not really sure why this is needed? Nullifier inclusion in contract initializer fails otherwise. 
    // If it were to fail, it should do it at line 443, investigation required
    env.advance_block_by(1);

    (env, token_contract_address, owner, recipient, mint_amount)
}

pub fn check_balance(token_contract_address: AztecAddress, address: AztecAddress, address_amount: Field) {
    cheatcodes::set_contract_address(token_contract_address);

    let balances_slot = Token::storage().balances.slot;
    let address_slot = derive_storage_slot_in_map(balances_slot, address);
    let mut options = NoteViewerOptions::new();
    let opt_notes: [Option<TokenNote>; MAX_NOTES_PER_PAGE] = view_notes(address_slot, options);
    assert(opt_notes[0].unwrap().amount.to_field() == address_amount);
}
