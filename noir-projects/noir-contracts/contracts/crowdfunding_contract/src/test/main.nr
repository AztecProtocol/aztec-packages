use crate::test::utils;
use crate::Crowdfunding;
use dep::claim::Claim;
use dep::token::Token;
use dep::authwit::cheatcodes as authwit_cheatcodes;

use dep::aztec::{prelude::AztecAddress, oracle::{unsafe_rand::unsafe_rand, execution::{get_chain_id, get_version, get_contract_address}}, test::helpers::cheatcodes};
use dep::value_note::value_note::ValueNote;

#[test]
fn main() {
    let (
        env,
        donation_token_contract_address,
        reward_token_contract_address,
        crowdfunding_contract_address,
        claim_contract_address,
        account_1,
        account_2
    ) = utils::setup();
    env.impersonate(account_1);

    env.call_private_void(Token::at(donation_token_contract_address).privately_mint_private_note(2000000));
    env.advance_block_by(1);

    let bal = env.call_unconstrained(donation_token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(bal, 2000000);

    let transfer_private_from_call_interface = Token::at(donation_token_contract_address).transfer_from(account_1, crowdfunding_contract_address, 999999, 0);
    authwit_cheatcodes::add_private_authwit_from_call_interface(account_1, crowdfunding_contract_address, transfer_private_from_call_interface);

    assert(crowdfunding_contract_address.eq(AztecAddress::from_field(0x2f931814ecca22bc73bc91827315eab2d08f6c907e3dbbbfeb9fc670612ba31a)));

    let claim_note: ValueNote= env.call_private(Crowdfunding::at(crowdfunding_contract_address).donate(999999));
    env.advance_block_by(1);

    let mut bal = env.call_unconstrained(donation_token_contract_address, || { Token::balance_of_private(account_1) });
    assert_eq(bal, 2000000 - 999999);

    bal = env.call_unconstrained(donation_token_contract_address, || { Token::balance_of_private(crowdfunding_contract_address) });
    assert_eq(bal, 999999);

    // This doesn't work because proving historical proofs don't work
    // env.call_private_void(Claim::at(claim_contract_address).claim(claim_note, account_1));
}
