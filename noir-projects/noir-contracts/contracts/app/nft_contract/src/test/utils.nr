use crate::NFT;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_account_contracts {
        let owner = env.create_contract_account();
        let recipient = env.create_contract_account();
        (owner, recipient)
    } else {
        let owner = env.create_light_account();
        let recipient = env.create_light_account();

        (owner, recipient)
    };

    // Deploy token contract
    let initializer_call_interface = NFT::interface().constructor(
        owner,
        "TestNFT000000000000000000000000",
        "TN00000000000000000000000000000",
    );
    let nft_contract_address =
        env.deploy("NFT").with_public_initializer(owner, initializer_call_interface);

    (env, nft_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, nft_contract_address, owner, recipient) = setup(with_account_contracts);
    let minted_token_id = 615;

    env.call_public(owner, NFT::at(nft_contract_address).mint(owner, minted_token_id));

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn setup_mint_and_transfer_to_private(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    let (env, nft_contract_address, owner, recipient, minted_token_id) =
        setup_and_mint(with_account_contracts);

    // We transfer the public NFT to private.
    env.call_private(
        owner,
        NFT::at(nft_contract_address).transfer_to_private(owner, minted_token_id),
    );

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn assert_owns_public_nft(
    env: TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let obtained_owner = env.view_public(NFT::at(nft_contract_address).owner_of(token_id));
    assert(owner == obtained_owner, "Incorrect NFT owner");
}

pub unconstrained fn assert_owns_private_nft(
    env: TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let (private_nfts, _) =
        env.simulate_utility(NFT::at(nft_contract_address).get_private_nfts(owner, 0));

    let mut nft_found = false;
    for obtained_token_id in private_nfts {
        if obtained_token_id == token_id {
            nft_found = true;
        }
    }

    assert(nft_found, "NFT not found in private nfts");
}
