use crate::NFT;
use crate::test::utils;

#[test]
unconstrained fn mint_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let token_id = 10000;
    NFT::at(nft_contract_address).mint(owner, token_id).call(&mut env.public());

    utils::assert_owns_public_nft(env, nft_contract_address, owner, token_id);
}

#[test]
unconstrained fn mint_failures() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // MINTING AS A NON-MINTER
    let token_id = 10000;
    env.impersonate(recipient);
    let mint_call_interface = NFT::at(nft_contract_address).mint(owner, token_id);
    env.assert_public_call_fails(mint_call_interface);

    assert(!utils::get_nft_exists(nft_contract_address, token_id), "NFT minted by non-minter");

    // MINTING THE SAME NFT TWICE
    env.impersonate(owner);
    mint_call_interface.call(&mut env.public());
    assert(utils::get_nft_exists(nft_contract_address, token_id), "NFT not minted");

    // Second call should fail
    env.assert_public_call_fails(mint_call_interface);

    // MINTING NFT WITH TOKEN ID 0
    let mint_call_interface = NFT::at(nft_contract_address).mint(owner, 0);
    env.assert_public_call_fails(mint_call_interface);
}
