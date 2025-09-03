use crate::NFT;
use crate::test::utils;
use aztec::protocol_types::traits::ToField;

#[test]
unconstrained fn access_control() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, new_admin) =
        utils::setup(/* with_account_contracts */ false);

    let nft = NFT::at(nft_contract_address);

    // Set a new admin
    env.call_public(owner, nft.set_admin(new_admin));
    assert_eq(env.view_public(nft.get_admin()), new_admin.to_field());

    // Check new admin is not a minter
    assert(!env.view_public(nft.is_minter(new_admin)));

    // Set new admin as minter
    env.call_public(new_admin, nft.set_minter(new_admin, true));
    assert(env.view_public(nft.is_minter(new_admin)));

    // Revoke minter as admin
    env.call_public(new_admin, nft.set_minter(new_admin, false));
    assert(!env.view_public(nft.is_minter(new_admin)));
}

#[test(should_fail_with = "caller is not an admin")]
unconstrained fn set_admin_requires_admin_caller() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, other) = utils::setup(/* with_account_contracts */ false);

    let nft = NFT::at(nft_contract_address);

    env.call_public(other, nft.set_admin(other));
}

#[test(should_fail_with = "caller is not an admin")]
unconstrained fn set_minter_requires_admin_caller() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, other) = utils::setup(/* with_account_contracts */ false);

    let nft = NFT::at(nft_contract_address);

    env.call_public(other, nft.set_minter(other, true));
}
