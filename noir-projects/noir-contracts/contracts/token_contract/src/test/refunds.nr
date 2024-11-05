use crate::{test::utils, Token};

use dep::authwit::cheatcodes as authwit_cheatcodes;
use std::test::OracleMock;

#[test]
unconstrained fn setup_refund_success() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_private(true);

    // Renaming owner and recipient to match naming in Token
    let user = owner;
    let fee_payer = recipient;

    let funded_amount = 1_000;

    // We use the same randomness for both the fee payer and the user as we currently don't have `OracleMock::mock_once()`
    let fee_payer_randomness = 123;
    let user_randomness = fee_payer_randomness;

    let _ = OracleMock::mock("getRandomField").returns(fee_payer_randomness);

    let setup_refund_from_call_interface =
        Token::at(token_contract_address).setup_refund(fee_payer, user, funded_amount);

    authwit_cheatcodes::add_private_authwit_from_call_interface(
        user,
        fee_payer,
        setup_refund_from_call_interface,
    );

    env.impersonate(fee_payer);

    setup_refund_from_call_interface.call(&mut env.private());

    // When the refund was set up, we would've spent the note worth mint_amount, and inserted a note worth
    //`mint_amount - funded_amount`. When completing the refund, we would've constructed a hash corresponding to a note
    // worth  `funded_amount - transaction_fee`. We "know" the transaction fee was 1 (it is hardcoded in
    // `executePublicFunction` TXE oracle) but we need to notify TXE of the note (preimage).
    utils::add_token_note(
        env,
        token_contract_address,
        fee_payer,
        1,
        fee_payer_randomness,
    );
    utils::add_token_note(
        env,
        token_contract_address,
        user,
        funded_amount - 1,
        user_randomness,
    );

    utils::check_private_balance(token_contract_address, user, mint_amount - 1);
    utils::check_private_balance(token_contract_address, fee_payer, 1)
}

// This test should be reworked when final support for partial notes is in
// Once that happens, the expected error message is commented out below
//#[test(should_fail_with="funded amount not enough to cover tx fee")]
#[test(should_fail_with = "Balance too low")]
unconstrained fn setup_refund_insufficient_funded_amount() {
    let (env, token_contract_address, owner, recipient, _mint_amount) =
        utils::setup_and_mint_private(true);

    // Renaming owner and recipient to match naming in Token
    let user = owner;
    let fee_payer = recipient;

    // We set funded amount to 0 to make the transaction fee higher than the funded amount
    let funded_amount = 0;

    let setup_refund_from_call_interface =
        Token::at(token_contract_address).setup_refund(fee_payer, user, funded_amount);

    authwit_cheatcodes::add_private_authwit_from_call_interface(
        user,
        fee_payer,
        setup_refund_from_call_interface,
    );

    env.impersonate(fee_payer);

    // The following should fail with "funded amount not enough to cover tx fee" because funded amount is 0
    setup_refund_from_call_interface.call(&mut env.private())
}
