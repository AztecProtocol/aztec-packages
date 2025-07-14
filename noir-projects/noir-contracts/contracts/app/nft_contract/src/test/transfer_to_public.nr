use crate::NFT;
use crate::test::utils;
use aztec::{
    oracle::random::random,
    test::helpers::{authwit::add_private_authwit_from_call_interface, txe_oracles},
};

#[test]
unconstrained fn transfer_to_public() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    NFT::at(nft_contract_address).transfer_to_public(sender, recipient, token_id, 0).call(
        &mut env.private(),
    );

    // Recipient should be the public owner
    utils::assert_owns_public_nft(env, nft_contract_address, recipient, token_id);
}

#[test]
unconstrained fn transfer_to_public_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    NFT::at(nft_contract_address).transfer_to_public(user, user, token_id, 0).call(
        &mut env.private(),
    );

    // Check the user stayed the public owner
    utils::assert_owns_public_nft(env, nft_contract_address, user, token_id);
}

#[test]
unconstrained fn transfer_to_public_on_behalf_of_other() {
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ true);

    let transfer_to_public_call_interface =
        NFT::at(nft_contract_address).transfer_to_public(sender, recipient, token_id, 0);
    add_private_authwit_from_call_interface(sender, recipient, transfer_to_public_call_interface);
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public the NFT
    transfer_to_public_call_interface.call(&mut env.private());

    // Recipient should be the public owner
    utils::assert_owns_public_nft(env, nft_contract_address, recipient, token_id);
}

#[test(should_fail_with = "NFT not found when transferring to public")]
unconstrained fn transfer_to_public_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, not_owner, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    env.impersonate(not_owner);
    NFT::at(nft_contract_address).transfer_to_public(not_owner, not_owner, token_id, 0).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_to_public_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    NFT::at(nft_contract_address).transfer_to_public(user, user, token_id, random()).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_to_public_failure_on_behalf_of_other_invalid_designated_caller() {
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ true);

    let transfer_to_public_call_interface =
        NFT::at(nft_contract_address).transfer_to_public(sender, recipient, token_id, 0);
    add_private_authwit_from_call_interface(sender, sender, transfer_to_public_call_interface);
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public the NFT
    transfer_to_public_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_to_public_failure_on_behalf_of_other_no_approval() {
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ true);

    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public the NFT
    NFT::at(nft_contract_address).transfer_to_public(sender, recipient, token_id, 0).call(
        &mut env.private(),
    );
}
