// TODO (#12692): The underlying issue stopping this from working is a big problem and needs to be fixed.

// use crate::Escrow;
// use dep::token::Token;

// use aztec::{
//     oracle::{execution::{get_block_number, get_contract_address}, storage::storage_read},
//     protocol_types::{address::AztecAddress, storage::map::derive_storage_slot_in_map},
//     test::helpers::{cheatcodes, test_environment::TestEnvironment},
// };

// pub unconstrained fn get_public_balance(
//     token_contract_address: AztecAddress,
//     address: AztecAddress,
// ) -> u128 {
//     let current_contract_address = get_contract_address();
//     cheatcodes::set_contract_address(token_contract_address);
//     let block_number = get_block_number();

//     let balances_slot = Token::storage_layout().public_balances.slot;
//     let address_slot = derive_storage_slot_in_map(balances_slot, address);
//     let amount: u128 = storage_read(token_contract_address, address_slot, block_number);
//     cheatcodes::set_contract_address(current_contract_address);
//     amount
// }

// pub unconstrained fn get_private_balance(
//     token_contract_address: AztecAddress,
//     address: AztecAddress,
// ) -> u128 {
//     let current_contract_address = get_contract_address();
//     cheatcodes::set_contract_address(token_contract_address);
//     // Direct call to unconstrained
//     let amt = Token::balance_of_private(address);
//     cheatcodes::set_contract_address(current_contract_address);
//     amt
// }

// global MINT_AMOUNT: u128 = 200000;

// unconstrained fn deploy_contracts(
//     env: &mut TestEnvironment,
//     admin_and_owner: AztecAddress,
// ) -> (AztecAddress, AztecAddress) {
//     env.impersonate(admin_and_owner);

//     // Deploy token contract
//     let donation_token_initializer_call_interface = Token::interface().constructor(
//         admin_and_owner,
//         "Token00000000000000000000000000",
//         "TKN0000000000000000000000000000",
//         18,
//     );
//     let donation_token_contract = env
//         .deploy("./@token_contract", "Token")
//         .with_public_void_initializer(donation_token_initializer_call_interface);
//     let token_contract_address = donation_token_contract.to_address();
//     env.mine_block();

//     // Deploy Escrow contract with public keys
//     let escrow_contract_initializer_call_interface =
//         Escrow::interface().constructor(admin_and_owner);
//     let escrow_contract = env
//         .deploy_with_public_keys("./@escrow_contract", "Escrow", 6969)
//         .with_private_initializer(escrow_contract_initializer_call_interface);
//     let escrow_contract_address = escrow_contract.to_address();

//     env.mine_block();

//     Token::at(token_contract_address)
//         .mint_to_private(admin_and_owner, admin_and_owner, MINT_AMOUNT)
//         .call(&mut env.private());

//     env.mine_block();

//     let private_balance_after_mint = get_private_balance(token_contract_address, admin_and_owner);
//     assert(private_balance_after_mint == MINT_AMOUNT);

//     (token_contract_address, escrow_contract_address)
// }

// #[test]
// unconstrained fn main() {
//     let mut env = TestEnvironment::new();

//     let (account_1, account_2) = (env.create_account_contract(1), env.create_account_contract(2));

//     let (token_contract_address, escrow_contract_address) = deploy_contracts(&mut env, account_1);

//     // We transfer tokens to the escrow contract
//     let TRANSFER_AMOUNT = 20000 as u128;
//     Token::at(token_contract_address).transfer(escrow_contract_address, TRANSFER_AMOUNT).call(
//         &mut env.private(),
//     );
//     env.mine_block();

//     let balance_of_escrow_after_transfer =
//         get_private_balance(token_contract_address, escrow_contract_address);

//     assert_eq(balance_of_escrow_after_transfer, TRANSFER_AMOUNT);

//     // We then withdraw some escrowed funds to account_2
//     let balance_of_account_2_before_withdrawal =
//         get_private_balance(token_contract_address, account_2);
//     assert(balance_of_account_2_before_withdrawal == 0 as u128);

//     let WITHDRAWAL_AMOUNT = 69 as u128;
//     Escrow::at(escrow_contract_address)
//         .withdraw(token_contract_address, WITHDRAWAL_AMOUNT, account_2)
//         .call(&mut env.private());
//     env.mine_block();

//     let balance_of_account_2_after_withdrawal =
//         get_private_balance(token_contract_address, account_2);
//     assert(balance_of_account_2_after_withdrawal == WITHDRAWAL_AMOUNT);

//     let balance_of_escrow_after_withdrawal =
//         get_private_balance(token_contract_address, escrow_contract_address);
//     assert(balance_of_escrow_after_withdrawal == TRANSFER_AMOUNT - WITHDRAWAL_AMOUNT);
// }
