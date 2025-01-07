use crate::abis::{
    base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
    block_root_or_block_merge_public_inputs::{BlockRootOrBlockMergePublicInputs, FeeRecipient},
    previous_rollup_block_data::PreviousRollupBlockData,
    previous_rollup_data::PreviousRollupData,
};
use dep::types::{
    abis::{
        accumulated_data::CombinedAccumulatedData, log_hash::ScopedLogHash,
        public_data_write::PublicDataWrite, public_log::PublicLog, sponge_blob::SpongeBlob,
    },
    constants::{
        AZTEC_MAX_EPOCH_DURATION, CONTRACT_CLASS_LOGS_PREFIX, L2_L1_MSGS_PREFIX,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, MAX_PUBLIC_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTES_PREFIX, NULLIFIERS_PREFIX,
        PRIVATE_LOG_SIZE_IN_FIELDS, PRIVATE_LOGS_PREFIX, PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
        PUBLIC_LOG_SIZE_IN_FIELDS, REVERT_CODE_PREFIX, TX_FEE_PREFIX, TX_START_PREFIX,
        UNENCRYPTED_LOGS_PREFIX,
    },
    hash::{accumulate_sha256, silo_contract_class_log_hash},
    merkle_tree::VariableMerkleTree,
    traits::is_empty,
    utils::{arrays::{array_concat, array_length, array_merge}, field::field_from_bytes},
};
use blob::blob_public_inputs::BlockBlobPublicInputs;

/**
 * Asserts that the tree formed by rollup circuits is filled greedily from L to R
 *
 */
pub fn assert_txs_filled_from_left(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    // assert that the left rollup is either a base (1 tx) or a balanced tree (num txs = power of 2)
    if (left.rollup_type == 1) {
        let left_txs = left.num_txs;
        let right_txs = right.num_txs;
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        assert(
            (left_txs) & (left_txs - 1) == 0,
            "The rollup should be filled greedily from L to R, but received an unbalanced left subtree",
        );
        assert(
            right_txs <= left_txs,
            "The rollup should be filled greedily from L to R, but received a L txs < R txs",
        );
    } else {
        assert(
            right.rollup_type == 0,
            "The rollup should be filled greedily from L to R, but received a L base and R merge",
        );
    }
}

/**
 * Asserts that the constants used in the left and right child are identical
 *
 */
pub fn assert_equal_constants(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    assert(left.constants.eq(right.constants), "input proofs have different constants");
}

// asserts that the end snapshot of previous_rollup 0 equals the start snapshot of previous_rollup 1 (i.e. ensure they
// follow on from one-another). Ensures that right uses the tree that was updated by left.
pub fn assert_prev_rollups_follow_on_from_each_other(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    assert(
        left.end.note_hash_tree.eq(right.start.note_hash_tree),
        "input proofs have different note hash tree snapshots",
    );
    assert(
        left.end.nullifier_tree.eq(right.start.nullifier_tree),
        "input proofs have different nullifier tree snapshots",
    );
    assert(
        left.end.public_data_tree.eq(right.start.public_data_tree),
        "input proofs have different public data tree snapshots",
    );
    assert(
        left.end_sponge_blob.eq(right.start_sponge_blob),
        "input proofs have different blob data sponges",
    );
}

pub fn assert_prev_block_rollups_follow_on_from_each_other(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) {
    assert(left.vk_tree_root == right.vk_tree_root, "input blocks have different vk tree roots");
    assert(
        left.protocol_contract_tree_root == right.protocol_contract_tree_root,
        "input blocks have different protocol contract tree roots",
    );
    assert(
        left.new_archive.eq(right.previous_archive),
        "input blocks have different archive tree snapshots",
    );
    assert(
        left.end_block_hash.eq(right.previous_block_hash),
        "input block hashes do not follow on from each other",
    );
    assert(
        left.end_global_variables.chain_id == right.start_global_variables.chain_id,
        "input blocks have different chain id",
    );
    assert(
        left.end_global_variables.version == right.start_global_variables.version,
        "input blocks have different chain version",
    );

    if right.is_padding() {
        assert(
            left.end_global_variables.block_number == right.start_global_variables.block_number,
            "input block numbers do not match",
        );
        assert(
            left.end_global_variables.timestamp == right.start_global_variables.timestamp,
            "input block timestamps do not match",
        );
    } else {
        assert(
            left.end_global_variables.block_number + 1 == right.start_global_variables.block_number,
            "input block numbers do not follow on from each other",
        );
        assert(
            left.end_global_variables.timestamp < right.start_global_variables.timestamp,
            "input block timestamps do not follow on from each other",
        );
    }
}

pub fn accumulate_fees(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) -> Field {
    left.accumulated_fees + right.accumulated_fees
}

pub fn accumulate_mana_used(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) -> Field {
    left.accumulated_mana_used + right.accumulated_mana_used
}

pub fn accumulate_blocks_fees(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [FeeRecipient; AZTEC_MAX_EPOCH_DURATION] {
    let left_len = array_length(left.fees);
    let right_len = array_length(right.fees);
    assert(
        left_len + right_len <= AZTEC_MAX_EPOCH_DURATION,
        "too many fee payment structs accumulated in rollup",
    );
    // TODO(Miranda): combine fees with same recipient depending on rollup structure
    // Assuming that the final rollup tree (block root -> block merge -> root) has max 32 leaves (TODO: constrain in root), then
    // in the worst case, we would be checking the left 16 values (left_len = 16) against the right 16 (right_len = 16).
    // Either way, construct arr in unconstrained and make use of hints to point to merged fee array.
    array_merge(left.fees, right.fees)
}

// TODO: This fn will be obselete once we have integrated accumulation of blob PIs
// The goal is to acc. the commitments and openings s.t. one set verifies the opening of many blobs
// How we accumulate is being worked on by @Mike
pub fn accumulate_blob_public_inputs(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [BlockBlobPublicInputs; AZTEC_MAX_EPOCH_DURATION] {
    let left_len = array_length(left.blob_public_inputs);
    let right_len = array_length(right.blob_public_inputs);
    assert(
        left_len + right_len <= AZTEC_MAX_EPOCH_DURATION,
        "too many blob public input structs accumulated in rollup",
    );
    // NB: For some reason, the below is around 150k gates cheaper than array_merge
    let mut add_from_left = true;
    let mut result = [BlockBlobPublicInputs::empty(); AZTEC_MAX_EPOCH_DURATION];
    for i in 0..result.len() {
        add_from_left &= i != left_len;
        if (add_from_left) {
            result[i] = left.blob_public_inputs[i];
        } else {
            result[i] = right.blob_public_inputs[i - left_len];
        }
    }
    result
}

/**
 * @brief From two previous rollup data, compute a single out hash
 *
 * @param previous_rollup_data
 * @return out hash stored in 2 fields
 */
pub fn compute_out_hash(previous_rollup_data: [PreviousRollupData; 2]) -> Field {
    accumulate_sha256([
        previous_rollup_data[0].base_or_merge_rollup_public_inputs.out_hash,
        previous_rollup_data[1].base_or_merge_rollup_public_inputs.out_hash,
    ])
}

pub fn compute_blocks_out_hash(previous_rollup_data: [PreviousRollupBlockData; 2]) -> Field {
    if previous_rollup_data[1].block_root_or_block_merge_public_inputs.is_padding() {
        previous_rollup_data[0].block_root_or_block_merge_public_inputs.out_hash
    } else {
        accumulate_sha256([
            previous_rollup_data[0].block_root_or_block_merge_public_inputs.out_hash,
            previous_rollup_data[1].block_root_or_block_merge_public_inputs.out_hash,
        ])
    }
}

pub fn compute_kernel_out_hash(l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX]) -> Field {
    let non_empty_items = array_length(l2_to_l1_msgs);
    let merkle_tree = VariableMerkleTree::new_sha(l2_to_l1_msgs, non_empty_items);
    merkle_tree.get_root()
}

/**
 * Asserts that the first sponge blob was empty to begin with.
 * This prevents injecting unchecked tx effects in the first base of a rollup.
 */
pub fn assert_first_sponge_blob_empty(left: BaseOrMergeRollupPublicInputs) {
    let expected_sponge_blob = SpongeBlob::new(left.start_sponge_blob.expected_fields);
    assert(
        left.start_sponge_blob.eq(expected_sponge_blob),
        "block's first blob sponge was not empty",
    );
}

/**
 * Converts given type (e.g. note hashes = 3) and length (e.g. 5) into a prefix: 0x03000005.
 * Uses 2 bytes to encode the length even when we only need 1 to keep uniform.
 */
pub fn encode_blob_prefix(input_type: u8, array_len: u32) -> Field {
    let len_bytes = (array_len as Field).to_be_bytes::<2>();
    field_from_bytes([input_type, 0, len_bytes[0], len_bytes[1]], true)
}

// Tx effects consist of
// 1 field for revert code
// 1 field for transaction fee
// MAX_NOTE_HASHES_PER_TX fields for note hashes
// MAX_NULLIFIERS_PER_TX fields for nullifiers
// MAX_L2_TO_L1_MSGS_PER_TX for L2 to L1 messages
// MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX public data update requests -> MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 fields
// TODO(#8954): When logs are refactored into fields, we will append the values here, for now appending the log hashes:
// MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_SIZE_IN_FIELDS fields for private logs
// MAX_PUBLIC_LOGS_PER_TX * PUBLIC_LOG_SIZE_IN_FIELDS fields for public logs
// MAX_CONTRACT_CLASS_LOGS_PER_TX fields for contract class logs
// 7 fields for prefixes for each of the above categories
pub(crate) global TX_EFFECTS_BLOB_HASH_INPUT_FIELDS: u32 = 1
    + 1
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2
    + MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_SIZE_IN_FIELDS
    + MAX_PUBLIC_LOGS_PER_TX * PUBLIC_LOG_SIZE_IN_FIELDS
    + MAX_CONTRACT_CLASS_LOGS_PER_TX
    + 7;
pub fn append_tx_effects_for_blob(
    combined: CombinedAccumulatedData,
    revert_code: u8,
    transaction_fee: Field,
    all_public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    start_sponge_blob: SpongeBlob,
) -> SpongeBlob {
    let (mut tx_effects_hash_input, offset) = get_tx_effects_hash_input(
        combined,
        revert_code,
        transaction_fee,
        all_public_data_update_requests,
        l2_to_l1_msgs,
    );

    // NB: using start.absorb & returning start caused issues in ghost values appearing in
    // base_rollup_inputs.start when using a fresh sponge. These only appeared when simulating via wasm.
    let mut out_sponge = start_sponge_blob;

    // If we have an empty tx (usually a padding tx), we don't want to absorb anything
    // An empty tx will only have 2 effects - revert code and fee - hence offset = 2
    if offset != 2 {
        out_sponge.absorb(tx_effects_hash_input, offset);
    }

    out_sponge
}

fn get_tx_effects_hash_input(
    combined: CombinedAccumulatedData,
    revert_code: u8,
    transaction_fee: Field,
    all_public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
) -> ([Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS], u32) {
    let mut tx_effects_hash_input = unsafe {
        get_tx_effects_hash_input_helper(
            combined,
            revert_code,
            transaction_fee,
            all_public_data_update_requests,
            l2_to_l1_msgs,
        )
    };

    let note_hashes = combined.note_hashes;
    let nullifiers = combined.nullifiers;

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    // The incoming all_public_data_update_requests may have empty update requests in the middle, so we move those to the end of the array.
    let public_data_update_requests =
        get_all_update_requests_for_tx_effects(all_public_data_update_requests);
    let private_logs = combined.private_logs;
    let unencrypted_logs =
        combined.unencrypted_logs_hashes.map(|log: ScopedLogHash| silo_unencrypted_log_hash(log));
    let contract_class_logs = combined.contract_class_logs_hashes.map(|log: ScopedLogHash| {
        silo_unencrypted_log_hash(log)
    });

    let mut offset = 0;
    let mut array_len = 0;

    // NB: for publishing fields of blob data we use the first element of the blob to encode:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // Two bytes are used to encode the number of fields appended here, given by 'offset'
    // We only know the value once the appending is complete, hence we overwrite input[0] below
    offset += 1;

    // TX FEE
    // Using 29 bytes to encompass all reasonable fee lengths
    assert_eq(
        tx_effects_hash_input[offset],
        field_from_bytes(
            array_concat([TX_FEE_PREFIX, 0], transaction_fee.to_be_bytes::<29>()),
            true,
        ),
    );
    offset += 1;

    // NB: The array_length function does NOT constrain we have a sorted left-packed array.
    // We can use it because all inputs here come from the kernels which DO constrain left-packing.
    // If that ever changes, we will have to constrain it by counting items differently.
    // NOTE HASHES
    array_len = array_length(note_hashes);
    if array_len != 0 {
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], notes_prefix);
        offset += 1;

        for j in 0..MAX_NOTE_HASHES_PER_TX {
            if j < array_len {
                assert_eq(tx_effects_hash_input[offset + j], note_hashes[j]);
            }
        }
        offset += array_len;
    }

    // NULLIFIERS
    array_len = array_length(nullifiers);
    if array_len != 0 {
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], nullifiers_prefix);
        offset += 1;

        for j in 0..MAX_NULLIFIERS_PER_TX {
            if j < array_len {
                assert_eq(tx_effects_hash_input[offset + j], nullifiers[j]);
            }
        }
        offset += array_len;
    }

    // L2 TO L1 MESSAGES
    array_len = array_length(l2_to_l1_msgs);
    if array_len != 0 {
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], l2_to_l1_msgs_prefix);
        offset += 1;

        for j in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            if j < array_len {
                assert_eq(tx_effects_hash_input[offset + j], l2_to_l1_msgs[j]);
            }
        }
        offset += array_len;
    }

    // PUBLIC DATA UPDATE REQUESTS
    array_len = array_length(public_data_update_requests);
    if array_len != 0 {
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, array_len * 2);
        assert_eq(tx_effects_hash_input[offset], public_data_update_requests_prefix);
        offset += 1;
        for j in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            if j < array_len {
                assert_eq(
                    tx_effects_hash_input[offset + j * 2],
                    public_data_update_requests[j].leaf_slot,
                );
                assert_eq(
                    tx_effects_hash_input[offset + j * 2 + 1],
                    public_data_update_requests[j].value,
                );
            }
        }
        offset += array_len * 2;
    }

    // TODO(Miranda): squash 0s in a nested loop and add len prefix?
    // PRIVATE_LOGS
    array_len = array_length(private_logs) * PRIVATE_LOG_SIZE_IN_FIELDS;
    if array_len != 0 {
        let private_logs_prefix = encode_blob_prefix(PRIVATE_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], private_logs_prefix);
        offset += 1;

        for j in 0..MAX_PRIVATE_LOGS_PER_TX {
            for k in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
                let index = offset + j * PRIVATE_LOG_SIZE_IN_FIELDS + k;
                if index < array_len {
                    assert_eq(tx_effects_hash_input[index], private_logs[j].fields[k]);
                }
            }
        }
        offset += array_len;
    }

    // TODO(#8954): When logs are refactored into fields, we will append the values here
    // Currently appending the single log hash as an interim solution
    // UNENCRYPTED LOGS
    array_len = array_length(unencrypted_logs);
    if array_len != 0 {
        let unencrypted_logs_prefix = encode_blob_prefix(UNENCRYPTED_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], unencrypted_logs_prefix);
        offset += 1;

        for j in 0..MAX_UNENCRYPTED_LOGS_PER_TX {
            if j < array_len {
                assert_eq(tx_effects_hash_input[offset + j], unencrypted_logs[j]);
            }
        }
        offset += array_len;
    }

    // CONTRACT CLASS LOGS
    array_len = array_length(contract_class_logs);
    if array_len != 0 {
        let contract_class_logs_prefix = encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], contract_class_logs_prefix);
        offset += 1;

        for j in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            if j < array_len {
                assert_eq(tx_effects_hash_input[offset + j], contract_class_logs[j]);
            }
        }
        offset += array_len;
    }

    // Now we know the number of fields appended, we can assign the first value:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // Start prefix is "tx_start".to_field() => 8 bytes
    let prefix_bytes = TX_START_PREFIX.to_be_bytes::<8>();
    let length_bytes = (offset as Field).to_be_bytes::<2>();
    // REVERT CODE
    assert_eq(
        tx_effects_hash_input[0],
        field_from_bytes(
            array_concat(
                prefix_bytes,
                [0, length_bytes[0], length_bytes[1], 0, REVERT_CODE_PREFIX, 0, revert_code],
            ),
            true,
        ),
    );

    (tx_effects_hash_input, offset)
}

unconstrained fn get_tx_effects_hash_input_helper(
    combined: CombinedAccumulatedData,
    revert_code: u8,
    transaction_fee: Field,
    all_public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
) -> [Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS] {
    let mut tx_effects_hash_input = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];

    let note_hashes = combined.note_hashes;
    let nullifiers = combined.nullifiers;

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    // The incoming all_public_data_update_requests may have empty update requests in the middle, so we move those to the end of the array.
    let public_data_update_requests =
        get_all_update_requests_for_tx_effects(all_public_data_update_requests);
    let private_logs = combined.private_logs;
    let public_logs = combined.public_logs;
    let contract_class_logs = combined.contract_class_logs_hashes.map(|log: ScopedLogHash| {
        silo_contract_class_log_hash(log)
    });

    let mut offset = 0;
    let mut array_len = 0;

    // NB: for publishing fields of blob data we use the first element of the blob to encode:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // Two bytes are used to encode the number of fields appended here, given by 'offset'
    // We only know the value once the appending is complete, hence we overwrite input[0] below
    tx_effects_hash_input[offset] = 0;
    offset += 1;

    // TX FEE
    // Using 29 bytes to encompass all reasonable fee lengths
    tx_effects_hash_input[offset] = field_from_bytes(
        array_concat([TX_FEE_PREFIX, 0], transaction_fee.to_be_bytes::<29>()),
        true,
    );
    offset += 1;

    // NB: The array_length function does NOT constrain we have a sorted left-packed array.
    // We can use it because all inputs here come from the kernels which DO constrain left-packing.
    // If that ever changes, we will have to constrain it by counting items differently.
    // NOTE HASHES
    array_len = array_length(note_hashes);
    if array_len != 0 {
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, array_len);
        tx_effects_hash_input[offset] = notes_prefix;
        offset += 1;

        for j in 0..MAX_NOTE_HASHES_PER_TX {
            tx_effects_hash_input[offset + j] = note_hashes[j];
        }
        offset += array_len;
    }

    // NULLIFIERS
    array_len = array_length(nullifiers);
    if array_len != 0 {
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, array_len);
        tx_effects_hash_input[offset] = nullifiers_prefix;
        offset += 1;

        for j in 0..MAX_NULLIFIERS_PER_TX {
            tx_effects_hash_input[offset + j] = nullifiers[j];
        }
        offset += array_len;
    }

    // L2 TO L1 MESSAGES
    array_len = array_length(l2_to_l1_msgs);
    if array_len != 0 {
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = l2_to_l1_msgs_prefix;
        offset += 1;

        for j in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            tx_effects_hash_input[offset + j] = l2_to_l1_msgs[j];
        }
        offset += array_len;
    }

    // PUBLIC DATA UPDATE REQUESTS
    array_len = array_length(public_data_update_requests);
    if array_len != 0 {
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, array_len * 2);
        tx_effects_hash_input[offset] = public_data_update_requests_prefix;
        offset += 1;
        for j in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            tx_effects_hash_input[offset + j * 2] = public_data_update_requests[j].leaf_slot;
            tx_effects_hash_input[offset + j * 2 + 1] = public_data_update_requests[j].value;
        }
        offset += array_len * 2;
    }

    // TODO(Miranda): squash 0s in a nested loop and add len prefix?
    // PRIVATE_LOGS
    array_len = array_length(private_logs) * PRIVATE_LOG_SIZE_IN_FIELDS;
    if array_len != 0 {
        let private_logs_prefix = encode_blob_prefix(PRIVATE_LOGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = private_logs_prefix;
        offset += 1;

        for j in 0..MAX_PRIVATE_LOGS_PER_TX {
            for k in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
                let index = offset + j * PRIVATE_LOG_SIZE_IN_FIELDS + k;
                tx_effects_hash_input[index] = private_logs[j].fields[k];
            }
        }
        offset += array_len;
    }

    // PUBLIC LOGS
    array_len = array_length(public_logs) * PUBLIC_LOG_SIZE_IN_FIELDS;
    if array_len != 0 {
        let unencrypted_logs_prefix = encode_blob_prefix(UNENCRYPTED_LOGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = unencrypted_logs_prefix;
        offset += 1;
        for j in 0..MAX_PUBLIC_LOGS_PER_TX {
            let log = public_logs[j].serialize();
            for k in 0..PUBLIC_LOG_SIZE_IN_FIELDS {
                let index = offset + j * PUBLIC_LOG_SIZE_IN_FIELDS + k;
                tx_effects_hash_input[index] = log[k];
            }
        }
        offset += array_len;
    }

    // TODO(#8954): When logs are refactored into fields, we will append the values here
    // Currently appending the single log hash as an interim solution
    // CONTRACT CLASS LOGS
    array_len = array_length(contract_class_logs);
    if array_len != 0 {
        let contract_class_logs_prefix = encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = contract_class_logs_prefix;
        offset += 1;

        for j in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            tx_effects_hash_input[offset + j] = contract_class_logs[j];
        }
        offset += array_len;
    }

    // Now we know the number of fields appended, we can assign the first value:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // Start prefix is "tx_start".to_field() => 8 bytes
    let prefix_bytes = TX_START_PREFIX.to_be_bytes::<8>();
    let length_bytes = (offset as Field).to_be_bytes::<2>();
    // REVERT CODE
    tx_effects_hash_input[0] = field_from_bytes(
        array_concat(
            prefix_bytes,
            [0, length_bytes[0], length_bytes[1], 0, REVERT_CODE_PREFIX, 0, revert_code],
        ),
        true,
    );

    tx_effects_hash_input
}

fn get_all_update_requests_for_tx_effects(
    all_public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
) -> [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] {
    let mut all_update_requests: BoundedVec<PublicDataWrite, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> =
        BoundedVec::new();
    for update_request in all_public_data_update_requests {
        if !is_empty(update_request) {
            all_update_requests.push(update_request);
        }
    }
    all_update_requests.storage()
}
