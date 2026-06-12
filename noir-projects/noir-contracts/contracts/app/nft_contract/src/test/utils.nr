use crate::NFT;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

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
    let initializer_call =
        NFT::interface().constructor(owner, "TestNFT000000000000000000000000", "TN00000000000000000000000000000");
    let nft_contract_address = env.deploy("NFT").with_public_initializer(owner, initializer_call);

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
    let (env, nft_contract_address, owner, recipient, minted_token_id) = setup_and_mint(with_account_contracts);

    // We transfer the public NFT to private.
    env.call_private(owner, NFT::at(nft_contract_address).transfer_to_private(owner, minted_token_id));

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
    let (private_nfts, _) = env.execute_utility(owner, NFT::at(nft_contract_address).get_private_nfts(owner, 0));

    let mut nft_found = false;
    for obtained_token_id in private_nfts {
        if obtained_token_id == token_id {
            nft_found = true;
        }
    }

    assert(nft_found, "NFT not found in private nfts");
}

// While authwits authorize a contract to perform an action, spending private notes still requires
// knowledge of the note secrets. For private tokens, the note owner must be involved in the
// transaction -- they cannot simply give another user an authwit and have that user spend the notes
// independently. We deploy a proxy contract so that msg_sender in the target differs from the
// caller, which is the condition that triggers authwit validation. We can't use another account for
// this, since different scopes are enforced by TXE.
pub unconstrained fn setup_with_proxy() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let (mut env, nft_contract_address, owner, recipient) = setup(/* with_account_contracts */ true);
    let proxy = env.deploy("@generic_proxy_contract/GenericProxy").without_initializer();
    (env, nft_contract_address, owner, recipient, proxy)
}

pub unconstrained fn setup_mint_and_transfer_to_private_with_proxy() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field, AztecAddress) {
    let (mut env, nft_contract_address, owner, recipient, token_id) =
        setup_mint_and_transfer_to_private(/* with_account_contracts */ true);
    let proxy = env.deploy("@generic_proxy_contract/GenericProxy").without_initializer();
    (env, nft_contract_address, owner, recipient, token_id, proxy)
}
