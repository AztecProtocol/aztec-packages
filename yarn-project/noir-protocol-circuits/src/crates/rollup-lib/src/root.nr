mod root_rollup_inputs;
use root_rollup_inputs::RootRollupInputs;
mod root_rollup_public_inputs;
use root_rollup_public_inputs::RootRollupPublicInputs;
use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use dep::types::utils::uint256::U256;
use dep::aztec::constants_gen::{NUM_FIELDS_PER_SHA256,NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,L1_TO_L2_MSG_SUBTREE_HEIGHT};
use crate::{components, hash::compute_block_hash_with_globals};
use crate::merkle_tree::{calculate_subtree, calculate_empty_tree_root};

impl RootRollupInputs {
    pub fn root_rollup_circuit(self) -> RootRollupPublicInputs {

        let left = self.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let right = self.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

        let aggregation_object = components::aggregate_proofs(left, right);
        components::assert_both_input_proofs_of_same_rollup_type(left, right);
        let _ = components::assert_both_input_proofs_of_same_height_and_return(left, right);
        components::assert_equal_constants(left, right);
        components::assert_prev_rollups_follow_on_from_each_other(left, right);

        // Check correct l1 to l2 tree given
        // Compute subtree inserting l1 to l2 messages
        let l1_to_l2_subtree_root = calculate_subtree(self.new_l1_to_l2_messages);

        // Insert subtree into the l1 to l2 data tree
        let empty_l1_to_l2_subtree_root = calculate_empty_tree_root(L1_TO_L2_MSG_SUBTREE_HEIGHT);
        let new_l1_to_l2_messages_tree_snapshot = components::insert_subtree_to_snapshot_tree(
            self.start_l1_to_l2_messages_tree_snapshot,
            self.new_l1_to_l2_messages_tree_root_sibling_path,
            empty_l1_to_l2_subtree_root,
            l1_to_l2_subtree_root,
            // TODO(Kev): For now we can add a test that this fits inside of 
            // a u8.
            L1_TO_L2_MSG_SUBTREE_HEIGHT as u8 
        );

        // Build the block hash for this iteration from the tree roots and global variables
        // Then insert the block into the historic blocks tree
        let block_hash = compute_block_hash_with_globals(left.constants.global_variables,
                                                      right.end_note_hash_tree_snapshot.root,
                                                      right.end_nullifier_tree_snapshot.root,
                                                      right.end_contract_tree_snapshot.root,
                                                      new_l1_to_l2_messages_tree_snapshot.root,
                                                      right.end_public_data_tree_root);

        // Update the historic blocks tree
        let end_historic_blocks_tree_snapshot = components::insert_subtree_to_snapshot_tree(
            self.start_historic_blocks_tree_snapshot,
            self.new_historic_blocks_tree_sibling_path,
            0,
            block_hash,
            0
        );

        let zeroed_out_snapshot = AppendOnlyTreeSnapshot {
            root : 0,
            next_available_leaf_index : 0
        };

        RootRollupPublicInputs{
            end_aggregation_object : aggregation_object,
            global_variables : left.constants.global_variables,
            start_note_hash_tree_snapshot : left.start_note_hash_tree_snapshot,
            end_note_hash_tree_snapshot : right.end_note_hash_tree_snapshot,
            start_nullifier_tree_snapshot : left.start_nullifier_tree_snapshot,
            end_nullifier_tree_snapshot : right.end_nullifier_tree_snapshot,
            start_contract_tree_snapshot : left.start_contract_tree_snapshot,
            end_contract_tree_snapshot : right.end_contract_tree_snapshot,
            start_public_data_tree_root : left.start_public_data_tree_root,
            end_public_data_tree_root : right.end_public_data_tree_root,
            start_l1_to_l2_messages_tree_snapshot : self.start_l1_to_l2_messages_tree_snapshot,
            end_l1_to_l2_messages_tree_snapshot : new_l1_to_l2_messages_tree_snapshot,
            start_historic_blocks_tree_snapshot : self.start_historic_blocks_tree_snapshot,
            end_historic_blocks_tree_snapshot : end_historic_blocks_tree_snapshot,
            calldata_hash : components::compute_calldata_hash(self.previous_rollup_data),
            l1_to_l2_messages_hash : compute_messages_hash(self.new_l1_to_l2_messages),

            // The cpp code was just not initializing these, so they would be zeroed out
            // TODO(Lasse/Jean): add explanation for this. 
            end_tree_of_historic_contract_tree_roots_snapshot : zeroed_out_snapshot,
            end_tree_of_historic_l1_to_l2_messages_tree_roots_snapshot : zeroed_out_snapshot,
            end_tree_of_historic_note_hash_tree_roots_snapshot : zeroed_out_snapshot,
            start_tree_of_historic_contract_tree_roots_snapshot : zeroed_out_snapshot,
            start_tree_of_historic_l1_to_l2_messages_tree_roots_snapshot : zeroed_out_snapshot,
            start_tree_of_historic_note_hash_tree_roots_snapshot : zeroed_out_snapshot,
        }
    }
}

// See `test_message_input_flattened_length` on keeping this in sync,
// why its here and how this constant was computed.
global NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES = 512;

// Computes the messages hash from the leaves array
//
// Returns the hash split into two field elements
fn compute_messages_hash(leaves : [Field; NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP]) -> [Field;NUM_FIELDS_PER_SHA256] {
    
    // Slice variation
    // let mut hash_input_flattened = [];
    // for leaf in leaves {
    //     let input_as_bytes = leaf.to_be_bytes(32);
    //     for i in 0..32 {
    //         // TODO(Kev): should check the complexity of repeatedly pushing
    //         hash_input_flattened.push(input_as_bytes[i]);
    //     }
    // }

    // Convert each field element into a byte array and append the bytes to `hash_input_flattened`
    let mut hash_input_flattened = [0; NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES];
    for offset in 0..NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP {
        let input_as_bytes = leaves[offset].to_be_bytes(32);
        for byte_index in 0..32 {
            hash_input_flattened[offset * 32 + byte_index] = input_as_bytes[byte_index];
        }
    }

    // Hash bytes and convert to 2 128 bit limbs
    let sha_digest = dep::std::hash::sha256(hash_input_flattened);
    // TODO(Kev): The CPP implementation is returning [high, low]
    // and so is `to_u128_limbs`, so this matches.
    // We should say why we are doing this vs [low, high]
    U256::from_bytes32(sha_digest).to_u128_limbs()
}

#[test]
fn test_message_input_flattened_length() {
    // This is here so that the global doesn't become outdated.
    // 
    // The short term solution to remove this is to use slices, though
    // those are a bit experimental right now, so TODO I'll add a test that the
    // slice version of compute_messages_hash is the same as the array version.
    // which uses the NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES global.
    assert(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 32 == NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES);
}


mod tests {
    use crate::{
        root::{
            root_rollup_inputs::RootRollupInputs,
            NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES
        },
    };
    use dep::types::hash::accumulate_sha256;
    use dep::types::utils::uint128::U128;
    use dep::types::utils::uint256::U256;
    use dep::aztec::constants_gen::{
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        L1_TO_L2_MSG_TREE_HEIGHT,
        L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
        L1_TO_L2_MSG_SUBTREE_HEIGHT,
        HISTORIC_BLOCKS_TREE_HEIGHT,
    };
    use crate::merkle_tree::{calculate_subtree, calculate_empty_tree_root};
    use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;

    pub fn compute_zero_hashes<N>(mut hashes: [Field; N]) -> [Field; N] {
        hashes[0] = dep::std::hash::pedersen_hash([0, 0]);

        for i in 1..N {
            hashes[i] = dep::std::hash::pedersen_hash([hashes[i-1], hashes[i-1]]);
        }

        hashes
    }

    pub fn compute_l1_l2_empty_snapshot() -> (AppendOnlyTreeSnapshot, [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH]) {
        let zero_hashes = compute_zero_hashes([0; L1_TO_L2_MSG_TREE_HEIGHT]);
        let mut new_l1_to_l2_messages_tree_root_sibling_path = [0; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH];

        for i in 0..L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH {
            let index = L1_TO_L2_MSG_SUBTREE_HEIGHT + i - 1;
            new_l1_to_l2_messages_tree_root_sibling_path[i] = zero_hashes[index];
        }

        (AppendOnlyTreeSnapshot{ root: zero_hashes[zero_hashes.len() - 1], next_available_leaf_index: 0 }, new_l1_to_l2_messages_tree_root_sibling_path)
    }

    pub fn compute_historic_blocks_tree_snapshot() -> (AppendOnlyTreeSnapshot, [Field; HISTORIC_BLOCKS_TREE_HEIGHT]) {
        let zero_hashes = compute_zero_hashes([0; HISTORIC_BLOCKS_TREE_HEIGHT]);
        let mut sibling_path = [0; HISTORIC_BLOCKS_TREE_HEIGHT];
        for i in 1..HISTORIC_BLOCKS_TREE_HEIGHT {
            sibling_path[i] = zero_hashes[i-1];
        }
        (AppendOnlyTreeSnapshot { root: zero_hashes[zero_hashes.len() - 1], next_available_leaf_index: 0 }, sibling_path)
    }


    #[test]
    fn check_block_hashes_empty_blocks(){
        let empty_l1_l2_messages = [0; NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP];
        let (l1_l2_empty_snapshot, l1_l2_empty_sibling_path) = compute_l1_l2_empty_snapshot();

        let sha_digest = dep::std::hash::sha256([0; NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP_NUM_BYTES]);

        let expected_messages_hash = U256::from_bytes32(sha_digest).to_u128_limbs();

        let expected_calldata_hash = accumulate_sha256([
            U128::from_field(0),
            U128::from_field(1),
            U128::from_field(2),
            U128::from_field(3)
        ]);

        let mut inputs: RootRollupInputs = dep::std::unsafe::zeroed();
        inputs.new_l1_to_l2_messages = empty_l1_l2_messages;
        inputs.new_l1_to_l2_messages_tree_root_sibling_path = l1_l2_empty_sibling_path;
        inputs.start_l1_to_l2_messages_tree_snapshot = l1_l2_empty_snapshot;

        let (historic_blocks_snapshot, historic_blocks_sibling_path) = compute_historic_blocks_tree_snapshot();

        inputs.start_historic_blocks_tree_snapshot = historic_blocks_snapshot;
        inputs.new_historic_blocks_tree_sibling_path = historic_blocks_sibling_path;

        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.calldata_hash = [0, 1];
        inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.calldata_hash = [2, 3];
        
        let outputs = inputs.root_rollup_circuit();
    
        // check calldata hash
        assert_eq(outputs.calldata_hash, expected_calldata_hash);
        // Check messages hash
        assert_eq(outputs.l1_to_l2_messages_hash, expected_messages_hash);
    }

}