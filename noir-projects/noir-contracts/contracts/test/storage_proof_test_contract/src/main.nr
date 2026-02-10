use aztec::macros::aztec;
mod storage_proofs;

#[aztec]
contract StorageProofTest {
    use crate::storage_proofs::{
        account_hash::compute_account_hash,
        keccak::{keccak256, KeccakHasher},
        path_verification::verify_path_section,
        slot_hash::compute_slot_hash,
        types::{Account, Node, StorageSlot},
        utils::to_nibbles,
    };
    use aztec::{
        context::calls::PrivateCall,
        macros::functions::{external, internal, only_self, view},
        oracle::capsules,
        protocol::{
            address::{AztecAddress, EthAddress},
            hash::poseidon2_hash,
            traits::{Deserialize, Serialize, ToField},
        },
    };

    global MAX_ACCOUNT_PROOF_LENGTH: u32 = 15;
    global NUM_NODES_VERIFIED_PER_CALL: u32 = 3;

    global ACCOUNT_CAPSULE_KEY_SEPARATOR: u32 = 100;
    global ACCOUNT_PROOF_CAPSULE_KEY_SEPARATOR: u32 = 101;
    global STORAGE_PROOF_CAPSULE_KEY_SEPARATOR: u32 = 102;
    global STORAGE_PROOF_NODE_CAPSULE_KEY_SEPARATOR: u32 = 103;

    #[external("public")]
    #[view]
    fn account_proof(
        account: Account,
        root: [u64; 4],
        nodes: [Node; MAX_ACCOUNT_PROOF_LENGTH],
        node_length: u32,
    ) {
        let trie_key = KeccakHasher::hash_bytes(account.address, 20);

        let (leaf_hash, new_index) =
            verify_path_section(nodes, node_length, 0, root, to_nibbles(trie_key));

        assert_eq(leaf_hash, compute_account_hash(account, new_index, trie_key));
    }

    #[external("private")]
    fn storage_proof(
        address: EthAddress,
        slot_key: [u8; 32],
        slot_contents: StorageSlot,
        eth_storage_root: [u64; 4],
    ) {
        // Get the address preimage hint
        let address_capsule_key = compute_address_capsule_key(eth_storage_root, address);
        // Safety: We'll check that the address inside the hint matches.
        let hinted_account = unsafe {
            Account::deserialize(capsules::load(self.address, address_capsule_key).unwrap())
        };
        assert_eq(hinted_account.address, address.to_field().to_be_bytes::<20>());

        // Get the account proof hint
        let account_proof_capsule_key = compute_account_proof_capsule_key(address_capsule_key);
        // Safety: This is a hint for verification so it'll be verified during merkle proof verification.
        let (hinted_account_proof_length, hinted_nodes) = unsafe {
            <(u32, [Node; MAX_ACCOUNT_PROOF_LENGTH]) as Deserialize>::deserialize(capsules::load(
                self.address,
                account_proof_capsule_key,
            )
                .unwrap())
        };

        // Enqueue the public call to do the account proof verification.
        self.enqueue_self_static.account_proof(
            hinted_account,
            eth_storage_root,
            hinted_nodes,
            hinted_account_proof_length,
        );

        // Now, let's do the storage proof verification privately.
        let storage_proof_capsule_key =
            compute_storage_proof_capsule_key(address_capsule_key, slot_key);

        // Safety: This is a hint for path verification.
        let hinted_storage_proof_length = unsafe {
            u32::deserialize(
                capsules::load(self.address, storage_proof_capsule_key).unwrap(),
            )
        };
        assert(hinted_storage_proof_length > 0, "Storage proof length must be greater than 0");

        let storage_trie_key = keccak256(slot_key, 32);

        let (slot_leaf_hash, slot_nibble_index) = call_verify_storage_proof_path_recursively(
            self.address,
            0,
            hinted_storage_proof_length,
            0,
            hinted_account.storage_hash,
            to_nibbles(storage_trie_key),
            storage_proof_capsule_key,
        )
            .call(self.context);

        assert_eq(
            slot_leaf_hash,
            compute_slot_hash(slot_contents, slot_nibble_index, storage_trie_key),
        );
    }

    #[only_self]
    #[external("private")]
    fn verify_storage_proof_path_recursively(
        num_processed_nodes: u32,
        num_total_nodes: u32,
        start_nibble_index: u32,
        parent_hash: [u64; 4],
        storage_trie_key_nibbles: [u8; 64],
        storage_proof_capsule_key: Field,
    ) -> ([u64; 4], u32) {
        let mut hinted_nodes: [Node; NUM_NODES_VERIFIED_PER_CALL] = std::mem::zeroed();
        let num_nodes_remaining = num_total_nodes - num_processed_nodes;
        let num_nodes_to_process = if num_nodes_remaining > NUM_NODES_VERIFIED_PER_CALL {
            NUM_NODES_VERIFIED_PER_CALL
        } else {
            num_nodes_remaining
        };
        for i in 0..NUM_NODES_VERIFIED_PER_CALL {
            let node_capsule_key =
                compute_node_capsule_key(storage_proof_capsule_key, num_processed_nodes + i);
            if i < num_nodes_to_process {
                // Safety: This is a hint for the path verification.
                hinted_nodes[i] = unsafe {
                    Node::deserialize(capsules::load(self.address, node_capsule_key).unwrap())
                };
            }
        }

        let (child_hash, end_nibble_index) = verify_path_section(
            hinted_nodes,
            num_nodes_to_process,
            start_nibble_index,
            parent_hash,
            storage_trie_key_nibbles,
        );

        let new_num_processed_nodes = num_processed_nodes + num_nodes_to_process;

        if new_num_processed_nodes == num_total_nodes {
            (child_hash, end_nibble_index)
        } else {
            call_verify_storage_proof_path_recursively(
                self.address,
                new_num_processed_nodes,
                num_total_nodes,
                end_nibble_index,
                child_hash,
                storage_trie_key_nibbles,
                storage_proof_capsule_key,
            )
                .call(self.context)
        }
    }

    // TODO(#7729): apply no_predicates to the contract interface method directly instead of having to use a wrapper
    // like we do here.
    #[no_predicates]
    #[contract_library_method]
    fn call_verify_storage_proof_path_recursively(
        this_address: AztecAddress,
        num_processed_nodes: u32,
        num_total_nodes: u32,
        start_nibble_index: u32,
        parent_hash: [u64; 4],
        storage_trie_key_nibbles: [u8; 64],
        storage_proof_capsule_key: Field,
    ) -> PrivateCall<37, 72, ([u64; 4], u32)> {
        StorageProofTest::at(this_address).verify_storage_proof_path_recursively(
            num_processed_nodes,
            num_total_nodes,
            start_nibble_index,
            parent_hash,
            storage_trie_key_nibbles,
            storage_proof_capsule_key,
        )
    }

    #[contract_library_method]
    fn compute_address_capsule_key(eth_storage_root: [u64; 4], address: EthAddress) -> Field {
        poseidon2_hash(
            (ACCOUNT_CAPSULE_KEY_SEPARATOR, eth_storage_root, address).serialize(),
        )
    }

    #[contract_library_method]
    fn compute_account_proof_capsule_key(address_capsule_key: Field) -> Field {
        poseidon2_hash(
            (ACCOUNT_PROOF_CAPSULE_KEY_SEPARATOR, address_capsule_key).serialize(),
        )
    }

    #[contract_library_method]
    fn compute_storage_proof_capsule_key(address_capsule_key: Field, slot_key: [u8; 32]) -> Field {
        poseidon2_hash((STORAGE_PROOF_CAPSULE_KEY_SEPARATOR, address_capsule_key, slot_key)
            .serialize())
    }

    #[contract_library_method]
    fn compute_node_capsule_key(storage_proof_capsule_key: Field, index: u32) -> Field {
        poseidon2_hash((STORAGE_PROOF_NODE_CAPSULE_KEY_SEPARATOR, storage_proof_capsule_key, index)
            .serialize())
    }

}
