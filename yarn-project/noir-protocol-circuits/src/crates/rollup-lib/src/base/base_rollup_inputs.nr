use crate::abis::nullifier_leaf_preimage::NullifierLeafPreimage;
use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use crate::abis::constant_rollup_data::ConstantRollupData;
use crate::abis::base_or_merge_rollup_public_inputs::{BaseOrMergeRollupPublicInputs, BASE_ROLLUP_TYPE};
use crate::merkle_tree::{calculate_subtree, calculate_empty_tree_root};
use crate::components;
use dep::types::utils::uint256::U256;
use dep::types::abis::public_data_update_request::PublicDataUpdateRequest;
use dep::types::abis::public_data_read::PublicDataRead;
use dep::types::mocked::{AggregationObject, Proof};
use dep::aztec::constants_gen::{
    MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP,
    NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
    NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
    CONTRACT_SUBTREE_SIBLING_PATH_LENGTH,
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_BASE_ROLLUP,
    MAX_PUBLIC_DATA_READS_PER_BASE_ROLLUP,
    PUBLIC_DATA_TREE_HEIGHT,
    KERNELS_PER_BASE_ROLLUP,
    MAX_NEW_CONTRACTS_PER_TX,
    NOTE_HASH_SUBTREE_HEIGHT,
    CONTRACT_SUBTREE_HEIGHT,
    NUM_FIELDS_PER_SHA256,
    MAX_NEW_COMMITMENTS_PER_TX,
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    MAX_PUBLIC_DATA_READS_PER_TX,
    MAX_NEW_NULLIFIERS_PER_TX,
    NUM_ENCRYPTED_LOGS_HASHES_PER_TX,
    MAX_NEW_L2_TO_L1_MSGS_PER_TX,
    NUM_UNENCRYPTED_LOGS_HASHES_PER_TX,
    NULLIFIER_SUBTREE_HEIGHT,
};
use dep::types::abis::previous_kernel_data::PreviousKernelData;
use dep::types::abis::membership_witness::NullifierMembershipWitness;
use dep::types::abis::membership_witness::HistoricBlocksTreeRootMembershipWitness;

// TODO(Alvaro) unify this with U256 in types
struct U256Compare {
    value: Field,
}

impl U256Compare {
    fn new(value: Field) -> Self {
        Self { value }
    }

    fn less_than(self, other: Self) -> bool {
        let self_bytes = self.value.to_be_bytes(32);
        let other_bytes = other.value.to_be_bytes(32);
        let mut less_than = false;

        for i in 0..32 {
            if (!less_than) & (self_bytes[i] < other_bytes[i]) {
                less_than = true;
            }
        }

        less_than
    }

    fn greater_than(self, other: Self) -> bool {
        let self_bytes = self.value.to_be_bytes(32);
        let other_bytes = other.value.to_be_bytes(32);
        let mut greater_than = false;

        for i in 0..32 {
            if (!greater_than) & (self_bytes[i] > other_bytes[i]) {
                greater_than = true;
            }
        }

        greater_than
    }

}

#[test]
fn test_u256_less_than() {
    let a = U256Compare::new(1);
    let b = U256Compare::new(1000);
    assert(a.less_than(b));
}

#[test]
fn test_u256_less_than_eq() {
    let a = U256Compare::new(1000);
    let b = U256Compare::new(1000);
    assert(!a.less_than(b));
}

#[test]
fn test_u256_less_than_greater() {
    let a = U256Compare::new(1);
    let b = U256Compare::new(1000);
    assert(!b.less_than(a));
}

#[test]
fn test_u256_greater_than() {
    let a = U256Compare::new(1);
    let b = U256Compare::new(1000);
    assert(b.greater_than(a));
}

#[test]
fn test_u256_greater_than_eq() {
    let a = U256Compare::new(1000);
    let b = U256Compare::new(1000);
    assert(!a.greater_than(b));
}

#[test]
fn test_u256_greater_than_less() {
    let a = U256Compare::new(1);
    let b = U256Compare::new(1000);
    assert(!a.greater_than(b));
}


struct BaseRollupInputs {
    kernel_data: [PreviousKernelData; KERNELS_PER_BASE_ROLLUP],
    start_note_hash_tree_snapshot: AppendOnlyTreeSnapshot,
    start_nullifier_tree_snapshot: AppendOnlyTreeSnapshot,
    start_contract_tree_snapshot: AppendOnlyTreeSnapshot,
    start_public_data_tree_root: Field,
    start_historic_blocks_tree_snapshot: AppendOnlyTreeSnapshot,

    low_nullifier_leaf_preimages: [NullifierLeafPreimage; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
    low_nullifier_membership_witness: [NullifierMembershipWitness; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],

    // For inserting the new subtrees into their respective trees:
    // Note: the insertion leaf index can be derived from the above snapshots' `next_available_leaf_index` values.
    new_commitments_subtree_sibling_path: [Field; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
    new_nullifiers_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
    new_contracts_subtree_sibling_path: [Field; CONTRACT_SUBTREE_SIBLING_PATH_LENGTH],
    new_public_data_update_requests_sibling_paths: [[Field; PUBLIC_DATA_TREE_HEIGHT]; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_BASE_ROLLUP],
    new_public_data_reads_sibling_paths: [[Field; PUBLIC_DATA_TREE_HEIGHT]; MAX_PUBLIC_DATA_READS_PER_BASE_ROLLUP],
    
    historic_blocks_tree_root_membership_witnesses: [HistoricBlocksTreeRootMembershipWitness; KERNELS_PER_BASE_ROLLUP],
    
    constants: ConstantRollupData,
}

impl BaseRollupInputs {
    pub fn base_rollup_circuit(self) -> BaseOrMergeRollupPublicInputs {        
        // Verify the previous kernel proofs
        // TODO(Kev) : Change this two to a named constant
        for i in 0..2 {
            let proof = self.kernel_data[i].proof;
            assert(verify_kernel_proof(proof), "kernel proof verification failed");
        };

        // Verify the kernel chain_id and versions
        for i in 0..2 {
            assert(self.kernel_data[i].public_inputs.constants.tx_context.chain_id ==
                   self.constants.global_variables.chain_id, "kernel chain_id does not match the rollup chain_id");
            assert(self.kernel_data[i].public_inputs.constants.tx_context.version ==
                              self.constants.global_variables.version, "kernel version does not match the rollup version");
        };

        // First we compute the contract tree leaves
        let contract_leaves = self.calculate_contract_leaves();
        let contracts_tree_subroot = self.calculate_contract_subtree(contract_leaves);

        let commitments_tree_subroot = self.calculate_commitments_subtree();

        let empty_commitments_subtree_root = calculate_empty_tree_root(NOTE_HASH_SUBTREE_HEIGHT);

        let end_note_hash_tree_snapshot = components::insert_subtree_to_snapshot_tree(
            self.start_note_hash_tree_snapshot,
            self.new_commitments_subtree_sibling_path,
            empty_commitments_subtree_root,
            commitments_tree_subroot,
            NOTE_HASH_SUBTREE_HEIGHT as u8,
        );

        // Insert contract subtrees:
        let  empty_contracts_subtree_root = calculate_empty_tree_root(CONTRACT_SUBTREE_HEIGHT);
        let end_contract_tree_snapshot = components::insert_subtree_to_snapshot_tree(
            self.start_contract_tree_snapshot,
            self.new_contracts_subtree_sibling_path,
            empty_contracts_subtree_root,
            contracts_tree_subroot,
            CONTRACT_SUBTREE_HEIGHT as u8,
        );

        // Insert nullifiers:
        let end_nullifier_tree_snapshot = self.check_nullifier_tree_non_membership_and_insert_to_tree();

        // Validate public public data reads and public data update requests, and update public data tree
        let end_public_data_tree_root = self.validate_and_process_public_state();

        // Calculate the overall calldata hash
        let calldata_hash = BaseRollupInputs::components_compute_kernel_calldata_hash(self.kernel_data);
        
        // Perform membership checks that the notes provided exist within the historic trees data
        self.perform_historical_blocks_tree_membership_checks();

        let aggregation_object = self.aggregate_proofs();

        BaseOrMergeRollupPublicInputs {
            rollup_type : BASE_ROLLUP_TYPE,
            rollup_subtree_height : 0,
            end_aggregation_object : aggregation_object,
            constants : self.constants,
            start_note_hash_tree_snapshot : self.start_note_hash_tree_snapshot,
            end_note_hash_tree_snapshot : end_note_hash_tree_snapshot,
            start_nullifier_tree_snapshot : self.start_nullifier_tree_snapshot,
            end_nullifier_tree_snapshot : end_nullifier_tree_snapshot,
            start_contract_tree_snapshot : self.start_contract_tree_snapshot,
            end_contract_tree_snapshot : end_contract_tree_snapshot,
            start_public_data_tree_root : self.start_public_data_tree_root,
            end_public_data_tree_root : end_public_data_tree_root,
            calldata_hash : calldata_hash,
        }
    }

    fn calculate_contract_leaves(self) -> [Field; NUM_CONTRACT_LEAVES] {
        let mut contract_leaves = [0; NUM_CONTRACT_LEAVES];
        for i in 0..2 {
            let new_contracts = self.kernel_data[i].public_inputs.end.new_contracts;

            // loop over the new contracts
            // TODO(Madiaa): NOTE: we are currently assuming that there is only going to be one
            for i in 0..new_contracts.len() {
                let leaf_preimage = new_contracts[i];
                // When there is no contract deployment, we should insert a zero leaf into the tree and ignore the
                // member-ship check. This is to ensure that we don't hit "already deployed" errors when we are not
                // deploying contracts. e.g., when we are only calling functions on existing contracts.
                let to_push = if leaf_preimage.contract_address.to_field() == 0  {
                    0
                } else {    
                    leaf_preimage.hash()
                };

                contract_leaves[i] = to_push;
            }
        }

        contract_leaves
    }

    // TODO(Kev): This should say calculate_contract_subtree_root
    // Cpp code says calculate_contract_subtree, so I'm leaving it as is for now
    fn calculate_contract_subtree(self, leaves : [Field; NUM_CONTRACT_LEAVES]) -> Field {
        calculate_subtree(leaves)
    }

    // TODO(Kev): This should say calculate_commitments_subtree_root
    // Cpp code says calculate_commitments_subtree, so I'm leaving it as is for now
    fn calculate_commitments_subtree(self) -> Field {
        let mut commitment_tree_leaves = [0; NOTE_HASH_SUBTREE_WIDTH];
        
        for i in 0..2 {
            let new_commitments = self.kernel_data[i].public_inputs.end.new_commitments;

            // Our commitments size MUST be 4 to calculate our subtrees correctly
            assert(new_commitments.len() == MAX_NEW_COMMITMENTS_PER_TX, "New commitments in kernel data must be MAX_NEW_COMMITMENTS_PER_TX (see constants.hpp)");

            for j in 0..MAX_NEW_COMMITMENTS_PER_TX {
                // TODO(Maddiaa): batch insert
                commitment_tree_leaves[i * MAX_NEW_COMMITMENTS_PER_TX + j] =  new_commitments[j];
            }
        }

        calculate_subtree(commitment_tree_leaves)
    }

    fn check_nullifier_tree_non_membership_and_insert_to_tree(self) -> AppendOnlyTreeSnapshot {
        // The below monologue is by Madiaa. fwiw, the plan was not simple.
        //
        // LADIES AND GENTLEMEN The P L A N ( is simple )
        // 1. Get the previous nullifier set setup
        // 2. Check for the first added nullifier that it doesnt exist
        // 3. Update the nullifier set
        // 4. Calculate a new root with the sibling path
        // 5. Use that for the next nullifier check.
        // 6. Iterate for all of em
        // 7. le bosh (profit)

        // BOYS AND GIRLS THE P L A N ( once the first plan is complete )
        // GENERATE OUR NEW NULLIFIER SUBTREE
        // 1. We need to point the new nullifiers to point to the index that the previous nullifier replaced
        // 2. If we receive the 0 nullifier leaf (where all values are 0, we skip insertion and leave a sparse subtree)

        // New nullifier subtree
        let mut nullifier_insertion_subtree = [NullifierLeafPreimage::default(); MAX_NEW_NULLIFIERS_PER_TX * 2];

        // This will update on each iteration
        let mut current_nullifier_tree_root = self.start_nullifier_tree_snapshot.root;

        // This will increase with every insertion
        let start_insertion_index = self.start_nullifier_tree_snapshot.next_available_leaf_index;
        let mut new_index = start_insertion_index;

        // For each kernel circuit
        for i in 0..2 {
            let new_nullifiers = self.kernel_data[i].public_inputs.end.new_nullifiers;
            // For each of our nullifiers
            for j in 0..MAX_NEW_NULLIFIERS_PER_TX { 
                // Witness containing index and path
                let nullifier_index = i * MAX_NEW_NULLIFIERS_PER_TX + j;

                let witness = self.low_nullifier_membership_witness[nullifier_index];
                // Preimage of the lo-index required for a non-membership proof
                let low_nullifier_preimage = self.low_nullifier_leaf_preimages[nullifier_index];
                // Newly created nullifier
                let nullifier = new_nullifiers[j];

                // TODO(maddiaa): reason about this more strongly, can this cause issues?
                if (nullifier != 0) {
                    // Create the nullifier leaf of the new nullifier to be inserted
                    let mut new_nullifier_leaf = NullifierLeafPreimage {
                        leaf_value : nullifier,
                        next_value : low_nullifier_preimage.next_value,
                        next_index : low_nullifier_preimage.next_index,
                    };

                    // Assuming populated premier subtree
                    if (low_nullifier_preimage.is_empty()) {
                        // check previous nullifier leaves
                        let mut matched = false;
                        for k in 0..nullifier_index {
                            if !matched {
                                if (!nullifier_insertion_subtree[k].is_empty()) {
                                    if ((U256Compare::new(nullifier_insertion_subtree[k].leaf_value).less_than(U256Compare::new(nullifier))) &
                                    (U256Compare::new(nullifier_insertion_subtree[k].next_value).greater_than(U256Compare::new(nullifier)) |
                                    (nullifier_insertion_subtree[k].next_value == 0))) {
                                        matched = true;
                                        // Update pointers
                                        new_nullifier_leaf.next_index = nullifier_insertion_subtree[k].next_index;
                                        new_nullifier_leaf.next_value = nullifier_insertion_subtree[k].next_value;

                                        // Update child
                                        nullifier_insertion_subtree[k].next_index = new_index;
                                        nullifier_insertion_subtree[k].next_value = nullifier;
                                    }
                                }
                            }

                        
                        }
                        // if not matched, our subtree will misformed - we must reject
                        assert(matched, "Nullifier subtree is malformed");

                    } else {
                        let is_less_than_nullifier = U256Compare::new(low_nullifier_preimage.leaf_value).less_than(U256Compare::new(nullifier));
                        let is_next_greater_than = U256Compare::new(low_nullifier_preimage.next_value).greater_than(U256Compare::new(nullifier));

                    if (!(is_less_than_nullifier & is_next_greater_than)) {
                        if ((low_nullifier_preimage.next_index != 0) & (low_nullifier_preimage.next_value != 0)) {
                            assert(false, "invalid nullifier range");
                        }
                    }

                    // Recreate the original low nullifier from the preimage
                    let original_low_nullifier = NullifierLeafPreimage{
                        leaf_value : low_nullifier_preimage.leaf_value,
                        next_value : low_nullifier_preimage.next_value,
                        next_index : low_nullifier_preimage.next_index,
                    };

                    // perform membership check for the low nullifier against the original root
                    components::assert_check_membership(
                        original_low_nullifier.hash(),
                        witness.leaf_index,
                        witness.sibling_path,
                        current_nullifier_tree_root,
                    );

                    // Calculate the new value of the low_nullifier_leaf
                    let updated_low_nullifier = NullifierLeafPreimage{ 
                                leaf_value : low_nullifier_preimage.leaf_value,
                                next_value : nullifier,
                                next_index : new_index 
                    };

                    // We need another set of witness values for this
                    current_nullifier_tree_root = components::root_from_sibling_path(
                        updated_low_nullifier.hash(), witness.leaf_index, witness.sibling_path);
                    }
                    nullifier_insertion_subtree[nullifier_index] = new_nullifier_leaf;
                } else {
                    // 0 case
                    let new_nullifier_leaf = NullifierLeafPreimage{ leaf_value : 0, next_value : 0, next_index : 0 };
                    nullifier_insertion_subtree[nullifier_index] = new_nullifier_leaf;
                }
                
                // increment insertion index
                new_index = new_index + 1;
            }
        }

        // Check that the new subtree is to be inserted at the next location, and is empty currently
        let empty_nullifier_subtree_root = calculate_empty_tree_root(NULLIFIER_SUBTREE_HEIGHT);
        let leafIndexNullifierSubtreeDepth = self.start_nullifier_tree_snapshot.next_available_leaf_index >> (NULLIFIER_SUBTREE_HEIGHT as u32);
        components::assert_check_membership(
            empty_nullifier_subtree_root,
            leafIndexNullifierSubtreeDepth as Field,
            self.new_nullifiers_subtree_sibling_path,
            current_nullifier_tree_root,
        );

        // Create new nullifier subtree to insert into the whole nullifier tree
        let nullifier_sibling_path = self.new_nullifiers_subtree_sibling_path;
        let nullifier_subtree_root = self.create_nullifier_subtree(nullifier_insertion_subtree);

        // Calculate the new root
        // We are inserting a subtree rather than a full tree here
        let subtree_index = start_insertion_index >> (NULLIFIER_SUBTREE_HEIGHT as u32);
        let new_root = components::root_from_sibling_path(nullifier_subtree_root, subtree_index as Field, nullifier_sibling_path);

        // Return the new state of the nullifier tree
        AppendOnlyTreeSnapshot {
            next_available_leaf_index: new_index,
            root: new_root,
        }
    }

    fn create_nullifier_subtree<N>(self, leaves: [NullifierLeafPreimage; N]) -> Field {
        calculate_subtree(leaves.map(|leaf:NullifierLeafPreimage| leaf.hash()))
    }

    fn validate_and_process_public_state(self) -> Field {
        // TODO(#2521) - data read validation should happen against the current state of the tx and not the start state.
        // Blocks all interesting usecases that read and write to the same public state in the same tx.
        // https://aztecprotocol.slack.com/archives/C02M7VC7TN0/p1695809629015719?thread_ts=1695653252.007339&cid=C02M7VC7TN0


        // Process public data reads and public data update requests for left input
        // validate_public_data_reads(
        //                            self.start_public_data_tree_root,
        //                            self.kernel_data[0].public_inputs.end.public_data_reads,
        //                            0,
        //                            self.new_public_data_reads_sibling_paths);

        let mid_public_data_tree_root = insert_public_data_update_requests(
            self.start_public_data_tree_root,
            self.kernel_data[0].public_inputs.end.public_data_update_requests,
            0,
            self.new_public_data_update_requests_sibling_paths
        );


        // TODO(#2521) - data read validation should happen against the current state of the tx and not the start state.
        // Blocks all interesting usecases that read and write to the same public state in the same tx.
        // https://aztecprotocol.slack.com/archives/C02M7VC7TN0/p1695809629015719?thread_ts=1695653252.007339&cid=C02M7VC7TN0


        // Process public data reads and public data update requests for right input using the resulting tree root from the
        // left one
        // validate_public_data_reads(
        //                            mid_public_data_tree_root,
        //                            baseRollupInputs.kernel_data[1].public_inputs.end.public_data_reads,
        //                            MAX_PUBLIC_DATA_READS_PER_TX,
        //                            baseRollupInputs.new_public_data_reads_sibling_paths);

        let end_public_data_tree_root = insert_public_data_update_requests(
            mid_public_data_tree_root,
            self.kernel_data[1].public_inputs.end.public_data_update_requests,
            MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            self.new_public_data_update_requests_sibling_paths
        );

        end_public_data_tree_root
    }

    // Computes the calldata hash for a base rollup
    // TODO(Kev): move this into components module
    fn components_compute_kernel_calldata_hash(kernel_data : [PreviousKernelData; KERNELS_PER_BASE_ROLLUP]) -> [Field; NUM_FIELDS_PER_SHA256]{
        // Compute calldata hashes
        // Consist of 2 kernels
        // 2 * MAX_NEW_COMMITMENTS_PER_TX fields for commitments
        // 2 * MAX_NEW_NULLIFIERS_PER_TX fields for nullifiers
        // 8 public data update requests (4 per kernel) -> 16 fields
        // 4 l2 -> l1 messages (2 per kernel) -> 4 fields
        // 2 contract deployments (1 per kernel) -> 6 fields
        // 2 encrypted logs hashes (1 per kernel) -> 4 fields --> 2 sha256 hashes --> 64 bytes
        // 2 unencrypted logs hashes (1 per kernel) -> 4 fields --> 2 sha256 hashes --> 64 bytes
        let mut calldata_hash_inputs = [0; CALLDATA_HASH_INPUT_SIZE];

        for i in 0..2 {
            let new_commitments = kernel_data[i].public_inputs.end.new_commitments;
            let new_nullifiers = kernel_data[i].public_inputs.end.new_nullifiers;
            let public_data_update_requests = kernel_data[i].public_inputs.end.public_data_update_requests;
            let newL2ToL1msgs = kernel_data[i].public_inputs.end.new_l2_to_l1_msgs;
            let encryptedLogsHash = kernel_data[i].public_inputs.end.encrypted_logs_hash;
            let unencryptedLogsHash = kernel_data[i].public_inputs.end.unencrypted_logs_hash;

            let mut offset = 0;

            for j in 0..MAX_NEW_COMMITMENTS_PER_TX {
                calldata_hash_inputs[offset + i * MAX_NEW_COMMITMENTS_PER_TX + j] = new_commitments[j];
            }
            offset += MAX_NEW_COMMITMENTS_PER_TX * 2;

            for j in 0..MAX_NEW_NULLIFIERS_PER_TX {
                calldata_hash_inputs[offset + i * MAX_NEW_NULLIFIERS_PER_TX + j] = new_nullifiers[j];
            }
            offset += MAX_NEW_NULLIFIERS_PER_TX * 2;

            for j in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
                calldata_hash_inputs[offset + i * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 + j * 2] =
                    public_data_update_requests[j].leaf_index;
                calldata_hash_inputs[offset + i * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 + j * 2 + 1] =
                    public_data_update_requests[j].new_value;
            }
            offset += MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 * 2;

            for j in 0..MAX_NEW_L2_TO_L1_MSGS_PER_TX {
                calldata_hash_inputs[offset + i * MAX_NEW_L2_TO_L1_MSGS_PER_TX + j] = newL2ToL1msgs[j];
            }
            offset += MAX_NEW_L2_TO_L1_MSGS_PER_TX * 2;

            let contract_leaf = kernel_data[i].public_inputs.end.new_contracts[0];
            calldata_hash_inputs[offset + i] = contract_leaf.hash();

            offset += MAX_NEW_CONTRACTS_PER_TX * 2;

            let new_contracts = kernel_data[i].public_inputs.end.new_contracts;
            calldata_hash_inputs[offset + i * 2] = new_contracts[0].contract_address.to_field();
            calldata_hash_inputs[offset + i * 2 + 1] = new_contracts[0].portal_contract_address.to_field();

            offset += MAX_NEW_CONTRACTS_PER_TX * 2 * 2;

            for j in 0..NUM_FIELDS_PER_SHA256 {
                calldata_hash_inputs[offset + i * 2 + j] = encryptedLogsHash[j];
            }

            offset += NUM_ENCRYPTED_LOGS_HASHES_PER_TX * NUM_FIELDS_PER_SHA256 * 2;

            for j in 0..NUM_FIELDS_PER_SHA256 {
                calldata_hash_inputs[offset + i * 2 + j] = unencryptedLogsHash[j];
            }
        }

        // NOTE!
        // We deviate from the cpp implementation.
        // TODO(KEV): I'm going to modify the cpp implementation to follow this route instead.
        // Summary:
        // The cpp implementation optimizes for the fact that the log hashes 
        // are actually 128 bits field elements. We can apply this optimization
        // after, the code for it in cpp looks messy and error prone.
        let mut hash_input_flattened = [0;CALLDATA_HASH_INPUT_SIZE * 32];
        for offset in 0..CALLDATA_HASH_INPUT_SIZE {
            let input_as_bytes = calldata_hash_inputs[offset].to_be_bytes(32);
            for byte_index in 0..32 {
                hash_input_flattened[offset * 32 + byte_index] = input_as_bytes[byte_index];
            }
        }

        let sha_digest = dep::std::hash::sha256(hash_input_flattened);
        U256::from_bytes32(sha_digest).to_u128_limbs()
    }

    // Check all of the provided commitments against the historical tree roots
    fn perform_historical_blocks_tree_membership_checks(self) {
        // For each of the historic_note_hash_tree_membership_checks, we need to do an inclusion proof
        // against the historical root provided in the rollup constants
        let historic_root = self.constants.start_historic_blocks_tree_roots_snapshot.root;

        for i in 0..2 {
            // Rebuild the block hash
            let historical_block_data = self.kernel_data[i].public_inputs.constants.block_data;
            let previous_block_hash = historical_block_data.block.hash();

            let historic_root_witness = self.historic_blocks_tree_root_membership_witnesses[i];

            components::assert_check_membership(
                previous_block_hash,
                historic_root_witness.leaf_index,
                historic_root_witness.sibling_path,
                historic_root
            );
        }
    }

    // TODO(Kev): This aggregate_proof method is duplicated in a lot of places
    fn aggregate_proofs(self) -> AggregationObject {
        // TODO: for now we simply return the aggregation object from the first proof
        self.kernel_data[0].public_inputs.end.aggregation_object
    }
}

fn verify_kernel_proof(proof : Proof) -> bool {
    // TODO: Just return true as we are mocking out the proof verification
    // and aggregation.
    // TODO(Kev): It may make sense to move all of these methods into a 
    // separate module.
    true
}   

fn insert_public_data_update_requests(
    tree_root : Field, 
    public_data_update_requests : [PublicDataUpdateRequest;MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX], 
    witnesses_offset : Field, 
    witnesses : [[Field; PUBLIC_DATA_TREE_HEIGHT]; 2 * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX]
) -> Field {
    let mut root = tree_root;

    for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
        let state_write = public_data_update_requests[i];
        let witness = witnesses[i + witnesses_offset];

        if (!state_write.is_empty()) {
            components::assert_check_membership(
                state_write.old_value,
                state_write.leaf_index,
                witness,
                root,
            );
            root = components::root_from_sibling_path(state_write.new_value, state_write.leaf_index, witness);
        }
    }

    root
}

fn validate_public_data_reads(
    tree_root : Field,
    public_data_reads : [PublicDataRead; MAX_PUBLIC_DATA_READS_PER_TX],
    witnesses_offset : Field,
    witnesses : [[Field; PUBLIC_DATA_TREE_HEIGHT]; 2 * MAX_PUBLIC_DATA_READS_PER_TX]
) {
    for i in 0..MAX_PUBLIC_DATA_READS_PER_TX {
        let public_data_read = public_data_reads[i];
        let witness = witnesses[i + witnesses_offset];

        if (!public_data_read.is_empty()) {
            components::assert_check_membership(
                public_data_read.value,
                public_data_read.leaf_index,
                witness,
                tree_root
            );
        }
    }
}



global NUM_CONTRACT_LEAVES = 2;
#[test]
fn consistent_num_contract_leaves() {
    assert(NUM_CONTRACT_LEAVES == MAX_NEW_CONTRACTS_PER_TX * 2, "num contract leaves incorrect, see calculate_contract_leaves to see how it is computed");
}

global NOTE_HASH_SUBTREE_WIDTH = 128;
#[test]
fn consistent_not_hash_subtree_width() {
    assert(NOTE_HASH_SUBTREE_WIDTH == 2.pow_32(NOTE_HASH_SUBTREE_HEIGHT), "note hash subtree width is incorrect");
}

global CALLDATA_HASH_INPUT_SIZE = 338;
#[test]
fn consistent_calldata_hash_input_size() {
    let expected_size = (MAX_NEW_COMMITMENTS_PER_TX + MAX_NEW_NULLIFIERS_PER_TX + MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 +
            MAX_NEW_L2_TO_L1_MSGS_PER_TX + MAX_NEW_CONTRACTS_PER_TX * 3 +
            NUM_ENCRYPTED_LOGS_HASHES_PER_TX * NUM_FIELDS_PER_SHA256 +
            NUM_UNENCRYPTED_LOGS_HASHES_PER_TX * NUM_FIELDS_PER_SHA256) * 2;
    assert(CALLDATA_HASH_INPUT_SIZE == expected_size, "calldata hash input size is incorrect");
}
