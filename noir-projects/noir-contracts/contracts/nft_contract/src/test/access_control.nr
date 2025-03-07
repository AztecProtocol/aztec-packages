use crate::NFT;
use crate::test::utils;
use aztec::protocol_types::traits::ToField;

#[test]
unconstrained fn access_control() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // Set a new admin
    NFT::at(nft_contract_address).set_admin(recipient).call(&mut env.public());

    env.advance_block_by(1);

    // Check it worked
    let admin = NFT::at(nft_contract_address).get_admin().view(&mut env.public());
    assert(admin == recipient.to_field());

    // Impersonate new admin
    env.impersonate(recipient);

    // Check new admin is not a minter
    let is_minter_call_interface = NFT::at(nft_contract_address).is_minter(recipient);
    let is_minter = is_minter_call_interface.view(&mut env.public());
    assert(is_minter == false);
    // Set admin as minter
    NFT::at(nft_contract_address).set_minter(recipient, true).call(&mut env.public());

    env.advance_block_by(1);

    // Check it worked
    let is_minter = is_minter_call_interface.view(&mut env.public());
    assert(is_minter == true);

    // Revoke minter as admin
    NFT::at(nft_contract_address).set_minter(recipient, false).call(&mut env.public());

    env.advance_block_by(1);

    // Check it worked
    let is_minter = is_minter_call_interface.view(&mut env.public());
    assert(is_minter == false);

    // Impersonate original admin
    env.impersonate(owner);

    // Try to set ourselves as admin, fail miserably
    env.assert_public_call_fails(NFT::at(nft_contract_address).set_admin(recipient));

    // Try to revoke minter status to recipient, fail miserably
    env.assert_public_call_fails(NFT::at(nft_contract_address).set_minter(recipient, false));
}
