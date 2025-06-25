use crate::NFT;
use crate::test::utils;
use aztec::{
    oracle::random::random,
    test::helpers::{authwit::add_private_authwit_from_call_interface, cheatcodes},
};

#[test]
unconstrained fn transfer_in_private() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    // Transfer the NFT to the recipient
    NFT::at(nft_contract_address).transfer_in_private(sender, recipient, token_id, 0).call(
        &mut env.private(),
    );

    // Recipient should have the note in their private nfts
    utils::assert_owns_private_nft(nft_contract_address, recipient, token_id);
}

#[test]
unconstrained fn transfer_in_private_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    // Transfer the NFT back to the owner
    NFT::at(nft_contract_address).transfer_in_private(owner, owner, token_id, 0).call(
        &mut env.private(),
    );

    // NFT owner should stay the same
    utils::assert_owns_private_nft(nft_contract_address, owner, token_id);
}

#[test]
unconstrained fn transfer_in_private_to_non_deployed_account() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);
    let not_deployed = cheatcodes::create_account(999);

    // Transfer the NFT to the recipient
    NFT::at(nft_contract_address)
        .transfer_in_private(sender, not_deployed.address, token_id, 0)
        .call(&mut env.private());

    // Owner of the private NFT should be the not_deployed account
    utils::assert_owns_private_nft(nft_contract_address, not_deployed.address, token_id);
}

#[test]
unconstrained fn transfer_in_private_on_behalf_of_other() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, nft_contract_address, sender, recipient, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ true);

    // Transfer the NFT to the recipient
    let transfer_in_private_call_interface =
        NFT::at(nft_contract_address).transfer_in_private(sender, recipient, token_id, 1);
    add_private_authwit_from_call_interface(sender, recipient, transfer_in_private_call_interface);

    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer the NFT to the recipient
    transfer_in_private_call_interface.call(&mut env.private());

    // Recipient should be the private NFT owner
    utils::assert_owns_private_nft(nft_contract_address, recipient, token_id);
}

#[test(should_fail_with = "NFT not found when transferring")]
unconstrained fn transfer_in_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, not_owner, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);
    // Try transferring the NFT from not_owner
    env.impersonate(not_owner);
    NFT::at(nft_contract_address).transfer_in_private(not_owner, owner, token_id, 0).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "invalid authwit nonce")]
unconstrained fn transfer_in_private_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough.
    // The authwit nonce check is in the beginning so we don't need to waste time on minting the NFT and transferring
    // it to private.
    let (env, nft_contract_address, sender, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // We set random value for the token_id as the authwit nonce check is before we use the value.
    let token_id = random();

    // Try transferring the NFT
    NFT::at(nft_contract_address).transfer_in_private(sender, recipient, token_id, 1).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_in_private_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    // The authwit check is in the beginning so we don't need to waste time on minting the NFT and transferring
    // it to private.
    let (env, nft_contract_address, sender, recipient) =
        utils::setup(/* with_account_contracts */ true);

    // We set random value for the token_id as the authwit nonce check is before we use the value.
    let token_id = random();

    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try transferring the NFT
    NFT::at(nft_contract_address).transfer_in_private(sender, recipient, token_id, 1).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_in_private_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    // The authwit check is in the beginning so we don't need to waste time on minting the NFT and transferring
    // it to private.
    let (env, nft_contract_address, sender, recipient) =
        utils::setup(/* with_account_contracts */ true);

    // We set random value for the token_id as the authwit nonce check is before we use the value.
    let token_id = random();

    let transfer_in_private_from_call_interface =
        NFT::at(nft_contract_address).transfer_in_private(sender, recipient, token_id, 1);
    add_private_authwit_from_call_interface(
        sender,
        sender,
        transfer_in_private_from_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try transferring the NFT
    transfer_in_private_from_call_interface.call(&mut env.private());
}
