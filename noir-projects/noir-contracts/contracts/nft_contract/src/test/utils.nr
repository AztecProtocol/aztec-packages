use dep::aztec::{
    hash::pedersen_hash, keys::getters::get_public_keys, prelude::{AztecAddress, NoteHeader},
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
    protocol_types::storage::map::derive_storage_slot_in_map,
    oracle::{execution::{get_block_number, get_contract_address}, unsafe_rand::unsafe_rand, storage::storage_read}
};
use crate::{types::nft_note::NFTNote, NFT};

pub fn setup(with_account_contracts: bool) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, recipient) = if with_account_contracts {
        let owner = env.create_account_contract(1);
        let recipient = env.create_account_contract(2);
        // Deploy canonical auth registry
        let _auth_registry = env.deploy("./@auth_registry_contract", "AuthRegistry").without_initializer();
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
        "TN00000000000000000000000000000"
    );
    let nft_contract = env.deploy_self("NFT").with_public_initializer(initializer_call_interface);
    let nft_contract_address = nft_contract.to_address();
    env.advance_block_by(1);
    (&mut env, nft_contract_address, owner, recipient)
}

pub fn setup_and_mint(with_account_contracts: bool) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    // Setup
    let (env, nft_contract_address, owner, recipient) = setup(with_account_contracts);
    let minted_token_id = 615;

    let mint_public_call_interface = NFT::at(nft_contract_address).mint(owner, minted_token_id);
    env.call_public(mint_public_call_interface);

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub fn setup_mint_and_transfer_to_private(with_account_contracts: bool) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, Field) {
    let (env, nft_contract_address, owner, recipient, minted_token_id) = setup_and_mint(with_account_contracts);

    let note_randomness = unsafe_rand();
    let transient_storage_slot_randomness = unsafe_rand();
    let transfer_preparer_storage_slot_commitment = pedersen_hash(
        [owner.to_field(), transient_storage_slot_randomness],
        NFT::TRANSIENT_STORAGE_SLOT_PEDERSEN_INDEX
    );

    // We prepare the transfer with user being both the sender and the recipient (classical "shield" flow)
    let prepare_transfer_to_private_call_interface = NFT::at(nft_contract_address).prepare_transfer_to_private(
        owner,
        owner,
        note_randomness,
        transient_storage_slot_randomness
    );
    env.call_private_void(prepare_transfer_to_private_call_interface);

    // Finalize the transfer of the NFT
    let finalize_transfer_to_private_call_interface = NFT::at(nft_contract_address).finalize_transfer_to_private(minted_token_id, transfer_preparer_storage_slot_commitment);
    env.call_public(finalize_transfer_to_private_call_interface);

    // Store the finalized note in the cache
    let mut context = env.private();
    let owner_npk_m_hash = get_public_keys(owner).npk_m.hash();
    let private_nfts_owner_slot = derive_storage_slot_in_map(NFT::storage().private_nfts.slot, owner);

    env.add_note(
        &mut NFTNote {
        token_id: minted_token_id,
        npk_m_hash: owner_npk_m_hash,
        randomness: note_randomness,
        header: NoteHeader::empty()
    },
        private_nfts_owner_slot,
        nft_contract_address
    );

    (env, nft_contract_address, owner, recipient, minted_token_id)
}

pub fn get_nft_exists(nft_contract_address: AztecAddress, token_id: Field) -> bool {
    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(nft_contract_address);
    let block_number = get_block_number();

    let nft_exists_slot = NFT::storage().nft_exists.slot;
    let nft_slot = derive_storage_slot_in_map(nft_exists_slot, token_id);
    let exists: bool = storage_read(nft_contract_address, nft_slot, block_number);
    cheatcodes::set_contract_address(current_contract_address);

    exists
}

pub fn assert_owns_public_nft(
    env: &mut TestEnvironment,
    nft_contract_address: AztecAddress,
    owner: AztecAddress,
    token_id: Field
) {
    let owner_of_interface = NFT::at(nft_contract_address).owner_of(token_id);
    let obtained_owner = env.call_public(owner_of_interface);

    assert(owner == obtained_owner, "Incorrect NFT owner");
}

pub fn assert_owns_private_nft(nft_contract_address: AztecAddress, owner: AztecAddress, token_id: Field) {
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
