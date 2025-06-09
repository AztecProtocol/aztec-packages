use crate::test::utils;
use crate::Token;
use aztec::protocol_types::traits::ToField;

#[test]
unconstrained fn access_control() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // Set a new admin
    let _ = env.call_public_test(owner, Token::at(token_contract_address).set_admin(recipient));
    // Check it worked
    let admin =
        env.call_public_test(owner, Token::at(token_contract_address).get_admin()).return_value;

    assert(admin == recipient.to_field());

    // Check new admin is not a minter
    let is_minter = env
        .call_public_test(recipient, Token::at(token_contract_address).is_minter(recipient))
        .return_value;
    assert(is_minter == false);

    // Set admin as minter
    let _ = env.call_public_test(
        recipient,
        Token::at(token_contract_address).set_minter(recipient, true),
    );

    // Check it worked
    let is_minter = env
        .call_public_test(recipient, Token::at(token_contract_address).is_minter(recipient))
        .return_value;
    assert(is_minter == true);

    // Revoke minter as admin
    let _ = env
        .call_public_test(recipient, Token::at(token_contract_address).set_minter(recipient, false))
        .return_value;

    // Check it worked
    let is_minter = env
        .call_public_test(recipient, Token::at(token_contract_address).is_minter(recipient))
        .return_value;
    assert(is_minter == false);

    // docs:start:assert_public_fail
    // Try to set ourselves as admin, fail miserably
    let set_admin_call_interface = Token::at(token_contract_address).set_admin(recipient);
    env.assert_public_call_fails(owner, set_admin_call_interface);
    // docs:end:assert_public_fail
    // Try to revoke minter status to recipient, fail miserably
    let set_minter_call_interface = Token::at(token_contract_address).set_minter(recipient, false);
    env.assert_public_call_fails(owner, set_minter_call_interface);
}
