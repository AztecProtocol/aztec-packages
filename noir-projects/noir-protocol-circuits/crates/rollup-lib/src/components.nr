use crate::abis::{
    base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
    block_root_or_block_merge_public_inputs::{BlockRootOrBlockMergePublicInputs, FeeRecipient},
    previous_rollup_data::PreviousRollupData, previous_rollup_block_data::PreviousRollupBlockData,
};
use dep::types::{
    hash::{
        accumulate_sha256, silo_unencrypted_log_hash, compute_tx_logs_hash, silo_encrypted_log_hash,
        compute_tx_note_logs_hash,
    }, merkle_tree::VariableMerkleTree,
    constants::{
        AZTEC_EPOCH_DURATION, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        MAX_UNENCRYPTED_LOGS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
        REVERT_CODE_PREFIX, TX_FEE_PREFIX, NOTES_PREFIX, NULLIFIERS_PREFIX, L2_L1_MSGS_PREFIX,
        PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, NOTE_ENCRYPTED_LOGS_PREFIX, ENCRYPTED_LOGS_PREFIX,
        UNENCRYPTED_LOGS_PREFIX,
    }, utils::{arrays::{array_length, array_merge, array_concat}, field::field_from_bytes},
    abis::{
        accumulated_data::CombinedAccumulatedData,
        public_data_update_request::PublicDataUpdateRequest, log_hash::{LogHash, ScopedLogHash},
        sponge_blob::SpongeBlob,
    },
};
use blob::blob_public_inputs::BlobPublicInputs;

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

// TODO(Miranda): split out?
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

pub fn accumulate_blocks_fees(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [FeeRecipient; AZTEC_EPOCH_DURATION] {
    let left_len = array_length(left.fees);
    let right_len = array_length(right.fees);
    assert(
        left_len + right_len <= AZTEC_EPOCH_DURATION,
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
) -> [BlobPublicInputs; AZTEC_EPOCH_DURATION] {
    let left_len = array_length(left.blob_public_inputs);
    let right_len = array_length(right.blob_public_inputs);
    assert(
        left_len + right_len <= AZTEC_EPOCH_DURATION,
        "too many blob public input structs accumulated in rollup",
    );
    array_merge(left.blob_public_inputs, right.blob_public_inputs)
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
// TODO(Miranda): combine fns?
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

fn silo_and_hash_unencrypted_logs(
    unencrypted_logs_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
) -> Field {
    let siloed_logs = unencrypted_logs_hashes.map(|log: ScopedLogHash| {
        LogHash {
            value: silo_unencrypted_log_hash(log),
            counter: log.log_hash.counter,
            length: log.log_hash.length,
        }
    });
    compute_tx_logs_hash(siloed_logs)
}

fn silo_and_hash_encrypted_logs(
    encrypted_logs_hashes: [ScopedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
) -> Field {
    let siloed_encrypted_logs = encrypted_logs_hashes.map(|log: ScopedLogHash| {
        LogHash {
            value: silo_encrypted_log_hash(log),
            counter: log.log_hash.counter,
            length: log.log_hash.length,
        }
    });
    compute_tx_logs_hash(siloed_encrypted_logs)
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

// Tx effects consist of
// 1 field for revert code
// 1 field for transaction fee
// MAX_NOTE_HASHES_PER_TX fields for note hashes
// MAX_NULLIFIERS_PER_TX fields for nullifiers
// MAX_L2_TO_L1_MSGS_PER_TX for L2 to L1 messages
// MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX public data update requests -> MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 fields
// TODO(#8954): When logs are refactored into fields, we will append the values here, for now appending the log hashes:
// MAX_NOTE_ENCRYPTED_LOGS_PER_TX fields for note encrypted logs
// MAX_ENCRYPTED_LOGS_PER_TX fields for encrypted logs
// MAX_UNENCRYPTED_LOGS_PER_TX fields for unencrypted logs
// 7 fields for prefixes for each of the above categories
global TX_EFFECTS_BLOB_HASH_INPUT_FIELDS: u32 = 1
    + 1
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2
    + MAX_NOTE_ENCRYPTED_LOGS_PER_TX
    + MAX_ENCRYPTED_LOGS_PER_TX
    + MAX_UNENCRYPTED_LOGS_PER_TX
    + 7;
pub fn append_tx_effects_for_blob(
    combined: CombinedAccumulatedData,
    revert_code: u8,
    transaction_fee: Field,
    all_public_data_update_requests: [PublicDataUpdateRequest; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    start_sponge_blob: SpongeBlob,
) -> SpongeBlob {
    let mut tx_effects_hash_input = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];

    let note_hashes = combined.note_hashes;
    let nullifiers = combined.nullifiers;

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    // The incoming all_public_data_update_requests may have empty update requests in the middle, so we move those to the end of the array.
    let public_data_update_requests =
        get_all_update_requests_for_tx_effects(all_public_data_update_requests);

    let note_encrypted_logs = combined.note_encrypted_logs_hashes.map(|log: LogHash| log.value);
    let encrypted_logs =
        combined.encrypted_logs_hashes.map(|log: ScopedLogHash| silo_encrypted_log_hash(log));
    let unencrypted_logs =
        combined.unencrypted_logs_hashes.map(|log: ScopedLogHash| silo_unencrypted_log_hash(log));

    let mut offset = 0;
    let mut array_len = 0;

    // REVERT CODE
    // upcast to Field to have the same size for the purposes of the hash
    tx_effects_hash_input[offset] = field_from_bytes([REVERT_CODE_PREFIX, 0, revert_code], true);
    offset += 1;

    // TX FEE
    // TODO(Miranda): how many bytes do we expect tx fee to be? Using 29 for now
    tx_effects_hash_input[offset] = field_from_bytes(
        array_concat([TX_FEE_PREFIX, 0], transaction_fee.to_be_bytes::<29>()),
        true,
    );
    offset += 1;

    // NOTE HASHES
    array_len = array_length(note_hashes);
    if array_len != 0 {
        let notes_prefix = field_from_bytes([NOTES_PREFIX, 0, array_len as u8], true);
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
        let nullifiers_prefix = field_from_bytes([NULLIFIERS_PREFIX, 0, array_len as u8], true);
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
        let l2_to_l1_msgs_prefix = field_from_bytes([L2_L1_MSGS_PREFIX, 0, array_len as u8], true);
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
        let public_data_update_requests_prefix = field_from_bytes(
            [PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, 0, (array_len as u8) * 2],
            true,
        );
        tx_effects_hash_input[offset] = public_data_update_requests_prefix;
        offset += 1;

        for j in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            tx_effects_hash_input[offset + j * 2] = public_data_update_requests[j].leaf_slot;
            tx_effects_hash_input[offset + j * 2 + 1] = public_data_update_requests[j].new_value;
        }
        offset += array_len * 2;
    }

    // TODO(#8954): When logs are refactored into fields, we will append the values here
    // Currently appending the single log hash as an interim solution
    // NOTE ENCRYPTED LOGS
    array_len = array_length(note_encrypted_logs);
    if array_len != 0 {
        let note_encrypted_logs_prefix =
            field_from_bytes([NOTE_ENCRYPTED_LOGS_PREFIX, 0, array_len as u8], true);
        tx_effects_hash_input[offset] = note_encrypted_logs_prefix;
        offset += 1;

        for j in 0..MAX_NOTE_ENCRYPTED_LOGS_PER_TX {
            tx_effects_hash_input[offset + j] = note_encrypted_logs[j];
        }
        offset += array_len;
    }

    // ENCRYPTED LOGS
    array_len = array_length(encrypted_logs);
    if array_len != 0 {
        let encrypted_logs_prefix =
            field_from_bytes([ENCRYPTED_LOGS_PREFIX, 0, array_len as u8], true);
        tx_effects_hash_input[offset] = encrypted_logs_prefix;
        offset += 1;

        for j in 0..MAX_ENCRYPTED_LOGS_PER_TX {
            tx_effects_hash_input[offset + j] = encrypted_logs[j];
        }
        offset += array_len;
    }

    // UNENCRYPTED LOGS
    array_len = array_length(unencrypted_logs);
    if array_len != 0 {
        let unencrypted_logs_prefix =
            field_from_bytes([UNENCRYPTED_LOGS_PREFIX, 0, array_len as u8], true);
        tx_effects_hash_input[offset] = unencrypted_logs_prefix;
        offset += 1;

        for j in 0..MAX_UNENCRYPTED_LOGS_PER_TX {
            tx_effects_hash_input[offset + j] = unencrypted_logs[j];
        }
        offset += array_len;
    }

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

fn get_all_update_requests_for_tx_effects(
    all_public_data_update_requests: [PublicDataUpdateRequest; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
) -> [PublicDataUpdateRequest; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] {
    let mut all_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX> =
        BoundedVec::new();
    for update_request in all_public_data_update_requests {
        if !update_request.is_empty() {
            all_update_requests.push(update_request);
        }
    }
    all_update_requests.storage
}
