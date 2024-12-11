use crate::{NFT, types::nft_note::NFTNote};
use dep::aztec::{
    oracle::{
        execution::{get_block_number, get_contract_address},
        random::random,
        storage::storage_read,
    },
    prelude::{AztecAddress, NoteHeader},
    protocol_types::storage::map::derive_storage_slot_in_map,
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
};
use std::test::OracleMock;

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
        let owner = env.create_account();
        let recipient = env.create_account();
        (owner, recipient)
    };

    // Start the test in the account contract address
    env.impersonate(owner);

    // Deploy token contract
    let initializer_call_interface = NFT::interface().constructor(
        owner,
        "TestNFT000000000000000000000000",
        "TN00000000000000000000000000000",
    );
    let nft_contract =
        env.deploy_self("NFT").with_public_void_initializer(initializer_call_interface);
    let nft_contract_address = nft_contract.to_address();
    env.advance_block_by(1);
    (&mut env, nft_contract_address, owner, recipient)
}

pub unconstrained fn setup_and_mint(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, nft_contract_address, owner, recipient) = setup(with_account_contracts);
    let minted_token_id = 615;

    NFT::at(nft_contract_address).mint(owner, minted_token_id).call(&mut env.public());

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn setup_mint_and_transfer_to_private(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    let (env, nft_contract_address, owner, recipient, minted_token_id) =
        setup_and_mint(with_account_contracts);

    let note_randomness = random();

    // We mock the Oracle to return the note randomness such that later on we can manually add the note
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // We transfer the public NFT to private.
    NFT::at(nft_contract_address).transfer_to_private(owner, minted_token_id).call(
        &mut env.private(),
    );

    // TODO(#8771): We need to manually add the note because in the partial notes flow `notify_created_note_oracle`
    // is not called and we don't have a `NoteProcessor` in TXE.
    let private_nfts_owner_slot =
        derive_storage_slot_in_map(NFT::storage_layout().private_nfts.slot, owner);

    env.add_note(
        &mut NFTNote {
            token_id: minted_token_id,
            owner,
            randomness: note_randomness,
            header: NoteHeader::empty(),
        },
        private_nfts_owner_slot,
        nft_contract_address,
    );

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub unconstrained fn get_nft_exists(nft_contract_address: AztecAddress, token_id: Field) -> bool {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(nft_contract_address);
    let block_number = get_block_number();

    let nft_exists_slot = NFT::storage_layout().nft_exists.slot;
    let nft_slot = derive_storage_slot_in_map(nft_exists_slot, token_id);
    let exists: bool = storage_read(nft_contract_address, nft_slot, block_number);
    cheatcodes::set_contract_address(current_contract_address);

    exists
}

pub unconstrained fn assert_owns_public_nft(
    env: &mut TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let obtained_owner = NFT::at(nft_contract_address).owner_of(token_id).view(&mut env.public());

    assert(owner == obtained_owner, "Incorrect NFT owner");
}

pub unconstrained fn assert_owns_private_nft(
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field,
) {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(nft_contract_address);

    // Direct call to unconstrained
    let (private_nfts, _) = NFT::get_private_nfts(owner, 0);

    let mut nft_found = false;
    for obtained_token_id in private_nfts {
        if obtained_token_id == token_id {
            nft_found = true;
        }
    }

    cheatcodes::set_contract_address(current_contract_address);

    assert(nft_found, "NFT not found in private nfts");
}
