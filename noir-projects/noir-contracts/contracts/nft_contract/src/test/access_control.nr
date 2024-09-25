use crate::test::utils;
use crate::NFT;

#[test]
unconstrained fn access_control() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, recipient) = utils::setup(/* with_account_contracts */ false);

    // Set a new admin
    env.call_public(NFT::at(nft_contract_address).set_admin(recipient));

    // Check it worked
    let admin = env.call_public(NFT::at(nft_contract_address).get_admin());
    assert(admin == recipient.to_field());

    // Impersonate new admin
    env.impersonate(recipient);

    // Check new admin is not a minter
    let is_minter_call_interface = NFT::at(nft_contract_address).is_minter(recipient);
    let is_minter = env.call_public(is_minter_call_interface);
    assert(is_minter == false);
    // Set admin as minter
    let set_minter_call_interface = NFT::at(nft_contract_address).set_minter(recipient, true);
    env.call_public(set_minter_call_interface);

    // Check it worked
    let is_minter = env.call_public(is_minter_call_interface);
    assert(is_minter == true);

    // Revoke minter as admin
    let set_minter_call_interface = NFT::at(nft_contract_address).set_minter(recipient, false);
    env.call_public(set_minter_call_interface);

    // Check it worked
    let is_minter = env.call_public(is_minter_call_interface);
    assert(is_minter == false);

    // Impersonate original admin
    env.impersonate(owner);

    // Try to set ourselves as admin, fail miserably
    env.assert_public_call_fails(NFT::at(nft_contract_address).set_admin(recipient));

    // Try to revoke minter status to recipient, fail miserably
    env.assert_public_call_fails(NFT::at(nft_contract_address).set_minter(recipient, false));
}
