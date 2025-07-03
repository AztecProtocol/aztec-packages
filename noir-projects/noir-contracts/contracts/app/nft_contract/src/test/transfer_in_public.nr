use crate::NFT;
use crate::test::utils;
use aztec::{oracle::random::random, test::helpers::authwit::add_public_authwit_from_call_interface};

#[test]
unconstrained fn transfer_in_public() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer the NFT
    NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, 0).call(
        &mut env.public(),
    );

    env.advance_block_by(1);

    utils::assert_owns_public_nft(env, nft_contract_address, recipient, token_id);
}

#[test]
unconstrained fn transfer_in_public_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer the NFT
    NFT::at(nft_contract_address).transfer_in_public(user, user, token_id, 0).call(&mut env.public());

    env.advance_block_by(1);

    // Check the user stayed the public owner
    utils::assert_owns_public_nft(env, nft_contract_address, user, token_id);
}

#[test]
unconstrained fn transfer_in_public_on_behalf_of_other() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ true);

    let transfer_in_public_from_call_interface =
        NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, 1);
    add_public_authwit_from_call_interface(
        sender,
        recipient,
        transfer_in_public_from_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer the NFT
    transfer_in_public_from_call_interface.call(&mut env.public());

    // Check the is recipient is the new public owner
    utils::assert_owns_public_nft(env, nft_contract_address, recipient, token_id);
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_in_public_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough.
    // The authwit check is in the beginning so we don't need to waste time on minting the NFT and transferring
    // it to private..
    let (env, nft_contract_address, sender, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // We set random value for the token_id as the authwit nonce check is before we use the value.
    let token_id = random();

    // Try to transfer the NFT
    NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, random()).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "invalid owner")]
unconstrained fn transfer_in_public_non_existent_nft() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // Try to transfer the NFT
    let token_id = 612;
    NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, 0).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn transfer_in_public_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ true);

    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try to transfer tokens
    NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, 1).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn transfer_in_public_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ true);
    let transfer_in_public_from_call_interface =
        NFT::at(nft_contract_address).transfer_in_public(sender, recipient, token_id, 1);
    add_public_authwit_from_call_interface(sender, sender, transfer_in_public_from_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try to transfer tokens
    transfer_in_public_from_call_interface.call(&mut env.public());
}
