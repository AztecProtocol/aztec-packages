use crate::{NFT, test::utils, types::nft_note::PartialNFTNote};
use aztec::{oracle::random::random, protocol_types::{address::AztecAddress, traits::Deserialize}};

/// Internal orchestration means that the calls to `prepare_private_balance_increase`
/// and `finalize_transfer_to_private` are done by the NFT contract itself.
/// In this test's case this is done by the `NFT::transfer_to_private(...)` function called
/// in `utils::setup_mint_and_transfer_to_private`.
#[test]
unconstrained fn transfer_to_private_internal_orchestration() {
    // The transfer to private is done in `utils::setup_mint_and_transfer_to_private` and for this reason
    // in this test we just call it and check the outcome.
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    // User should have the note in their private nfts
    utils::assert_owns_private_nft(env, nft_contract_address, user, token_id);

    // Since the NFT was sent to private, the public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

/// External orchestration means that the calls to prepare and finalize are not done by the NFT contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // We prepare the transfer
    let partial_note = env
        .call_private(
            owner,
            NFT::at(nft_contract_address).prepare_private_balance_increase(recipient),
        )
        .return_value;

    // Finalize the transfer of the NFT (message sender owns the NFT in public)
    let _ = env.call_public(
        owner,
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, partial_note),
    );

    // Recipient should have the note in their private nfts
    utils::assert_owns_private_nft(env, nft_contract_address, recipient, token_id);

    // Since the NFT got transferred to private public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

#[test(should_fail)] // should_fail_with = "Invalid partial note or completer"
unconstrained fn transfer_to_private_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the partial note
    let commitment = random();
    let partial_note = PartialNFTNote::deserialize([commitment]);

    // Try finalizing the transfer without preparing it
    let _ = env.call_public(
        owner,
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, partial_note),
    );
}

#[test(should_fail)] // should_fail_with = "invalid NFT owner"
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, not_owner, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // (For this specific test we could set a random value for the commitment and not do the call to `prepare...`
    // as the NFT owner check is before we use the value but that would made the test less robust against changes
    // in the contract.)
    let partial_note = env
        .call_private(
            owner,
            NFT::at(nft_contract_address).prepare_private_balance_increase(not_owner),
        )
        .return_value;

    // Try transferring someone else's public NFT
    let _ = env.call_public(
        not_owner,
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, partial_note),
    );
}

#[test(should_fail)] // should_fail_with = "Invalid partial note or completer"
unconstrained fn incorrect_completer_cannot_complete_partial_note() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough.
    let (env, nft_contract_address, owner, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // We set up the completer
    let completer = env.create_account(3);

    // We prepare the partial note as a completer.
    let partial_note = env
        .call_private(
            completer,
            NFT::at(nft_contract_address).prepare_private_balance_increase(recipient),
        )
        .return_value;

    // Now we try to complete the partial note as another completer. Note that the caller here is the owner of the token
    // we're transferring - this is so that we pass the owner check and fail on the partial note completer check.
    let _ = env.call_public(
        owner,
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, partial_note),
    );
}
