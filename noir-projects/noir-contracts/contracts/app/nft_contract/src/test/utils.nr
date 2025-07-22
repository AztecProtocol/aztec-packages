use crate::NFT;
use aztec::{
    oracle::{execution::get_contract_address, notes::set_sender_for_tags},
    protocol_types::address::AztecAddress,
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};

pub unconstrained fn setup(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_account_contracts {
        let owner = env.create_account_contract(1);
        let recipient = env.create_account_contract(2);
        (owner, recipient)
    } else {
        let owner = env.create_account(1);
        let recipient = env.create_account(2);

        // We are not deploying any account contracts and so we need to manually set the sender for tags. This is
        // usually done by account contract's entrypoint.
        let sender = env.create_account(7097070);
        set_sender_for_tags(sender);

        (owner, recipient)
    };

    // Deploy token contract
    let initializer_call_interface = NFT::interface().constructor(
        owner,
        "TestNFT000000000000000000000000",
        "TN00000000000000000000000000000",
    );
    let nft_contract =
        env.deploy_self("NFT").with_public_void_initializer(owner, initializer_call_interface);
    let nft_contract_address = nft_contract.to_address();

    (&mut env, nft_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, nft_contract_address, owner, recipient) = setup(with_account_contracts);
    let minted_token_id = 615;

    let _ = env.call_public_void(owner, NFT::at(nft_contract_address).mint(owner, minted_token_id));

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn setup_mint_and_transfer_to_private(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    let (env, nft_contract_address, owner, recipient, minted_token_id) =
        setup_and_mint(with_account_contracts);

    // We transfer the public NFT to private.
    let _ = env.call_private_void(
        owner,
        NFT::at(nft_contract_address).transfer_to_private(owner, minted_token_id),
    );

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn assert_owns_public_nft(
    env: &mut TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let obtained_owner = env.view_public(NFT::at(nft_contract_address).owner_of(token_id));
    assert(owner == obtained_owner, "Incorrect NFT owner");
}

pub unconstrained fn assert_owns_private_nft(
    env: &mut TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let (private_nfts, _) = env.simulate_utility(NFT::at(nft_contract_address)
        ._experimental_get_private_nfts(owner, 0));

    let mut nft_found = false;
    for obtained_token_id in private_nfts {
        if obtained_token_id == token_id {
            nft_found = true;
        }
    }

    assert(nft_found, "NFT not found in private nfts");
}
