use crate::NFT;
use crate::test::utils;
use aztec::protocol_types::storage::map::derive_storage_slot_in_map;

#[test]
unconstrained fn mint_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let token_id = 10000;
    env.call_public(owner, NFT::at(nft_contract_address).mint(owner, token_id));

    utils::assert_owns_public_nft(env, nft_contract_address, owner, token_id);
}

#[test(should_fail_with = "caller is not a minter")]
unconstrained fn mint_as_non_minter_fails() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, other) = utils::setup(/* with_account_contracts */ false);

    let token_id = 10000;
    env.call_public(other, NFT::at(nft_contract_address).mint(owner, token_id));
}

#[test(should_fail_with = "token already exists")]
unconstrained fn mint_twice_fails() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let token_id = 10000;
    env.call_public(owner, NFT::at(nft_contract_address).mint(owner, token_id));

    env.utility_context_at(nft_contract_address, |context| {
        let nft_exists_slot = NFT::storage_layout().nft_exists.slot;
        let nft_slot = derive_storage_slot_in_map(nft_exists_slot, token_id);
        assert(context.storage_read(nft_slot));
    });

    env.call_public(owner, NFT::at(nft_contract_address).mint(owner, token_id));
}

#[test(should_fail_with = "zero token ID not supported")]
unconstrained fn mint_id_0_fails() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    env.call_public(owner, NFT::at(nft_contract_address).mint(owner, 0));
}
