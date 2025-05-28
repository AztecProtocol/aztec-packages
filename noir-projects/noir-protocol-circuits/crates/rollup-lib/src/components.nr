use crate::abis::block_root_or_block_merge_public_inputs::{
    BlockRootOrBlockMergePublicInputs, FeeRecipient,
};
use super::abis::tx_effect::TxEffect;
use dep::types::{
    abis::{
        contract_class_log::ContractClassLog, log_hash::LogHash, private_log::PrivateLog,
        public_data_write::PublicDataWrite, public_log::PublicLog, side_effect::scoped::Scoped,
        sponge_blob::SpongeBlob,
    },
    constants::{
        AZTEC_MAX_EPOCH_DURATION, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_LOGS_PREFIX,
        L2_L1_MSGS_PREFIX, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_PUBLIC_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTES_PREFIX,
        NULLIFIERS_PREFIX, PRIVATE_LOG_SIZE_IN_FIELDS, PRIVATE_LOGS_PREFIX,
        PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, PUBLIC_LOG_SIZE_IN_FIELDS, PUBLIC_LOGS_PREFIX,
        REVERT_CODE_PREFIX, TX_FEE_PREFIX, TX_START_PREFIX,
    },
    hash::compute_contract_class_log_hash,
    merkle_tree::VariableMerkleTree,
    traits::{Empty, ToField},
    utils::arrays::{array_length, array_length_until, array_merge, array_padded_with},
};
use blob::blob_public_inputs::BlockBlobPublicInputs;

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

pub fn accumulate_proposed_block_header_hashes(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [Field; AZTEC_MAX_EPOCH_DURATION] {
    array_merge(
        left.proposed_block_header_hashes,
        right.proposed_block_header_hashes,
    )
}

pub fn accumulate_blocks_fees(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [FeeRecipient; AZTEC_MAX_EPOCH_DURATION] {
    // TODO(Miranda): combine fees with same recipient depending on rollup structure
    // Assuming that the final rollup tree (block root -> block merge -> root) has max 32 leaves (TODO: constrain in root), then
    // in the worst case, we would be checking the left 16 values (left_len = 16) against the right 16 (right_len = 16).
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
    // NB: The below is cheaper than array_merge because assigning BlockBlobPublicInputs is cheaper than calling .equals
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

pub fn compute_kernel_out_hash(l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX]) -> Field {
    let non_empty_items = array_length(l2_to_l1_msgs);
    let merkle_tree = VariableMerkleTree::new_sha(l2_to_l1_msgs, non_empty_items);
    merkle_tree.get_root()
}

pub fn validate_contract_class_log(
    log_hash: Scoped<LogHash>,
    log_fields: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS],
) {
    // Validate length.
    // Ensure that all fields after the actual length are zero.
    // Otherwise, only the truncated length would be emitted via blobs,
    // but the hash are verified in the next step by computing over all CONTRACT_CLASS_LOG_SIZE_IN_FIELDS fields.
    // This mismatch would make it impossible to verify the contract class later,
    // because the correct hash could no longer be recomputed from the emitted data.
    assert(
        array_padded_with(log_fields, log_hash.inner.length, 0),
        "incorrect contract class log length",
    );

    // Validate hash.
    let expected_hash = if log_hash.inner.length == 0 {
        0
    } else {
        compute_contract_class_log_hash(log_fields)
    };
    assert_eq(log_hash.inner.value, expected_hash, "mismatched contract class log hash");
}

/**
 * Converts given type (e.g. note hashes = 3) and length (e.g. 5) into a prefix: 0x03000005.
 * Uses 2 bytes to encode the length even when we only need 1 to keep uniform.
 */
pub fn encode_blob_prefix(input_type: u8, array_len: u32) -> Field {
    let array_len = array_len as Field;
    array_len.assert_max_bit_size::<16>();
    (input_type as Field) * (256 * 256 * 256) + array_len
}

// Tx effects consist of
// 1 field for revert code
// 1 field for tx hash
// 1 field for transaction fee
// MAX_NOTE_HASHES_PER_TX fields for note hashes
// MAX_NULLIFIERS_PER_TX fields for nullifiers
// MAX_L2_TO_L1_MSGS_PER_TX for L2 to L1 messages
// MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX public data update requests -> MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 fields
// MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1) fields for private logs (+1 for length of each log)
// MAX_PUBLIC_LOGS_PER_TX * (PUBLIC_LOG_SIZE_IN_FIELDS + 2) fields for public logs (+1 for length and +1 for contract address)
// MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1) fields for contract class logs (+1 for length of each log)
// 7 fields for prefixes for each of the above categories
pub(crate) global TX_EFFECTS_BLOB_HASH_INPUT_FIELDS: u32 = 1
    + 1
    + 1
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2
    + MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1)
    + MAX_PUBLIC_LOGS_PER_TX * (PUBLIC_LOG_SIZE_IN_FIELDS + 2)
    + MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1)
    + 7;

pub(crate) fn append_tx_effects_for_blob(
    tx_effect: TxEffect,
    start_sponge_blob: SpongeBlob,
) -> SpongeBlob {
    let (mut tx_effects_hash_input, num_blob_fields) = get_tx_effects_hash_input(tx_effect);

    // NB: using start.absorb & returning start caused issues in ghost values appearing in
    // base_rollup_inputs.start when using a fresh sponge. These only appeared when simulating via wasm.
    let mut out_sponge = start_sponge_blob;

    // If we have an empty tx (usually a padding tx), we don't want to absorb anything
    // An empty tx will only have 3 fields - revert code, tx hash and fee
    if num_blob_fields != 3 {
        out_sponge.absorb(tx_effects_hash_input, num_blob_fields);
    }

    out_sponge
}

fn get_tx_effects_hash_input(
    tx_effect: TxEffect,
) -> ([Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS], u32) {
    tx_effect.transaction_fee.assert_max_bit_size::<29 * 8>();
    let TWO_POW_240 = 1766847064778384329583297500742918515827483896875618958121606201292619776;
    let prefixed_tx_fee: Field =
        (TX_FEE_PREFIX as Field) * TWO_POW_240 + (tx_effect.transaction_fee as Field);

    let note_hashes = tx_effect.note_hashes;
    let nullifiers = tx_effect.nullifiers;

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    let public_data_update_requests = tx_effect.public_data_writes;
    let private_logs = tx_effect.private_logs;
    let public_logs = tx_effect.public_logs;
    let contract_class_logs = tx_effect.contract_class_logs;

    // Safety: This constructs the array of effects and is constrained below.
    let (tx_effects_hash_input, num_blob_fields) = unsafe {
        get_tx_effects_hash_input_helper(
            tx_effect.tx_hash,
            prefixed_tx_fee,
            tx_effect.note_hashes,
            tx_effect.nullifiers,
            tx_effect.l2_to_l1_msgs,
            public_data_update_requests,
            private_logs,
            public_logs,
            contract_class_logs,
            tx_effect.revert_code as Field,
        )
    };

    let mut offset = 0;
    let mut array_len = 0;

    // NB: for publishing fields of blob data we use the first element of the blob to encode:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // num_blob_fields is checked at the end against the offset.
    let expected_tx_start_field =
        generate_tx_start_field(num_blob_fields as Field, tx_effect.revert_code as Field);
    assert_eq(tx_effects_hash_input[offset], expected_tx_start_field);
    offset += 1;

    assert_eq(tx_effects_hash_input[offset], tx_effect.tx_hash);
    offset += 1;

    // TX FEE
    // Using 29 bytes to encompass all reasonable fee lengths
    assert_eq(tx_effects_hash_input[offset], prefixed_tx_fee);
    offset += 1;

    // NB: The array_length function does NOT constrain we have a sorted left-packed array.
    // We can use it because all inputs here come from the kernels which DO constrain left-packing.
    // If that ever changes, we will have to constrain it by counting items differently.
    // NOTE HASHES
    array_len = array_length(note_hashes);
    if array_len != 0 {
        let mut check_elt = true;
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], notes_prefix);
        offset += 1;

        for j in 0..MAX_NOTE_HASHES_PER_TX {
            check_elt &= j != array_len;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], note_hashes[j]);
            }
        }
        offset += array_len;
    }

    // NULLIFIERS
    array_len = array_length(nullifiers);
    if array_len != 0 {
        let mut check_elt = true;
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], nullifiers_prefix);
        offset += 1;

        for j in 0..MAX_NULLIFIERS_PER_TX {
            check_elt &= j != array_len;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], nullifiers[j]);
            }
        }
        offset += array_len;
    }

    // L2 TO L1 MESSAGES
    array_len = array_length(tx_effect.l2_to_l1_msgs);
    if array_len != 0 {
        let mut check_elt = true;
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], l2_to_l1_msgs_prefix);
        offset += 1;

        for j in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            check_elt &= j != array_len;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], tx_effect.l2_to_l1_msgs[j]);
            }
        }
        offset += array_len;
    }

    // PUBLIC DATA UPDATE REQUESTS
    array_len = array_length(public_data_update_requests);
    if array_len != 0 {
        let mut check_elt = true;
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], public_data_update_requests_prefix);
        offset += 1;
        for j in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            check_elt &= j != array_len;
            if check_elt {
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

    // PRIVATE_LOGS
    array_len = array_length(private_logs);
    if array_len != 0 {
        let private_logs_prefix = encode_blob_prefix(PRIVATE_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], private_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..MAX_PRIVATE_LOGS_PER_TX {
            check_log &= j != array_len;
            let log = private_logs[j];
            if check_log {
                assert_eq(tx_effects_hash_input[offset], log.length as Field);
                offset += 1;
            }
            let mut check_elt = true;
            for k in 0..log.fields.len() {
                check_elt &= k != log.length;
                if check_elt {
                    assert_eq(tx_effects_hash_input[offset + k], log.fields[k]);
                }
            }
            offset += log.length;
        }
    }

    // PUBLIC LOGS
    array_len = array_length(public_logs);
    if array_len != 0 {
        let public_logs_prefix = encode_blob_prefix(PUBLIC_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], public_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..MAX_PUBLIC_LOGS_PER_TX {
            check_log &= j != array_len;
            let public_log = public_logs[j];
            let log = public_log.log;
            if check_log {
                assert_eq(tx_effects_hash_input[offset], log.length as Field);
                offset += 1;
                assert_eq(tx_effects_hash_input[offset], public_log.contract_address.to_field());
                offset += 1;
            }
            let mut check_elt = true;
            for k in 0..log.fields.len() {
                check_elt &= k != log.length;
                if check_elt {
                    assert_eq(tx_effects_hash_input[offset + k], log.fields[k]);
                }
            }
            offset += log.length;
        }
    }

    // CONTRACT CLASS LOGS
    // We can use array_length_until here because the cc logs are emitted from protocol contract only.
    // This means that there can't be a log with length 0 in the middle of non-empty logs.
    array_len = array_length_until(contract_class_logs, |log| log.log.length == 0);
    if array_len != 0 {
        let contract_class_logs_prefix = encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, array_len);
        assert_eq(tx_effects_hash_input[offset], contract_class_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            check_log &= j != array_len;
            let cc_log = contract_class_logs[j];
            let log = cc_log.log;
            if check_log {
                assert_eq(tx_effects_hash_input[offset], log.length as Field);
                offset += 1;
                assert_eq(tx_effects_hash_input[offset], cc_log.contract_address.to_field());
                offset += 1;
            }
            let mut check_elt = true;
            for k in 0..CONTRACT_CLASS_LOG_SIZE_IN_FIELDS {
                check_elt &= k != log.length;
                if check_elt {
                    assert_eq(tx_effects_hash_input[offset + k], log.fields[k]);
                }
            }
            offset += log.length;
        }
    }

    // Verify that the number of fields appended to blob matches the hint given by the unconstrained function.
    assert_eq(offset, num_blob_fields);

    (tx_effects_hash_input, offset)
}

fn generate_tx_start_field(num_blob_fields: Field, revert_code: Field) -> Field {
    // TX_START_PREFIX | 0 | 0 | 0 | 0 | REVERT_CODE_PREFIX | 0 | 0
    let constant = (TX_START_PREFIX as Field) * (256 * 256 * 256 * 256 * 256 * 256 * 256)
        + (REVERT_CODE_PREFIX as Field) * (256 * 256);

    let tx_start_field = constant + num_blob_fields * (256 * 256 * 256 * 256) + revert_code;

    tx_start_field
}

unconstrained fn get_tx_effects_hash_input_helper(
    tx_hash: Field,
    prefixed_tx_fee: Field,
    note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    public_logs: [PublicLog; MAX_PUBLIC_LOGS_PER_TX],
    contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    revert_code: Field,
) -> ([Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS], u32) {
    let mut tx_effects_hash_input = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    // The incoming all_public_data_update_requests may have empty update requests in the middle, so we move those to the end of the array.

    tx_effects_hash_input[1] = tx_hash;

    // TX FEE
    // Using 29 bytes to encompass all reasonable fee lengths
    tx_effects_hash_input[2] = prefixed_tx_fee;

    let mut offset = 3;

    // NB: The array_length function does NOT constrain we have a sorted left-packed array.
    // We can use it because all inputs here come from the kernels which DO constrain left-packing.
    // If that ever changes, we will have to constrain it by counting items differently.
    // NOTE HASHES
    let array_len = array_length(note_hashes);
    if array_len != 0 {
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, array_len);
        tx_effects_hash_input[offset] = notes_prefix;
        offset += 1;

        for j in 0..array_len {
            tx_effects_hash_input[offset + j] = note_hashes[j];
        }
        offset += array_len;
    }

    // NULLIFIERS
    let array_len = array_length(nullifiers);
    if array_len != 0 {
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, array_len);
        tx_effects_hash_input[offset] = nullifiers_prefix;
        offset += 1;

        for j in 0..array_len {
            tx_effects_hash_input[offset + j] = nullifiers[j];
        }
        offset += array_len;
    }

    // L2 TO L1 MESSAGES
    let array_len = array_length(l2_to_l1_msgs);
    if array_len != 0 {
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = l2_to_l1_msgs_prefix;
        offset += 1;

        for j in 0..array_len {
            tx_effects_hash_input[offset + j] = l2_to_l1_msgs[j];
        }
        offset += array_len;
    }

    // PUBLIC DATA UPDATE REQUESTS
    let array_len = array_length(public_data_update_requests);
    if array_len != 0 {
        let public_data_update_requests_prefix =
            encode_blob_prefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, array_len);
        tx_effects_hash_input[offset] = public_data_update_requests_prefix;
        offset += 1;
        for j in 0..array_len {
            tx_effects_hash_input[offset + j * 2] = public_data_update_requests[j].leaf_slot;
            tx_effects_hash_input[offset + j * 2 + 1] = public_data_update_requests[j].value;
        }
        offset += array_len * 2;
    }

    // PRIVATE_LOGS
    // TODO(#13915): Use array_length_until().
    let num_private_logs = array_length(private_logs);
    if num_private_logs != 0 {
        tx_effects_hash_input[offset] = encode_blob_prefix(PRIVATE_LOGS_PREFIX, num_private_logs);
        offset += 1;

        for j in 0..num_private_logs {
            let log = private_logs[j];
            let log_len = log.length;
            tx_effects_hash_input[offset] = log_len as Field;
            offset += 1;
            for k in 0..log_len {
                tx_effects_hash_input[offset + k] = log.fields[k];
            }
            offset += log_len;
        }
    }

    // PUBLIC LOGS
    // TODO(#13915): Use array_length_until().
    let num_public_logs = array_length(public_logs);
    if num_public_logs != 0 {
        tx_effects_hash_input[offset] = encode_blob_prefix(PUBLIC_LOGS_PREFIX, num_public_logs);
        offset += 1;

        for j in 0..num_public_logs {
            let log = public_logs[j];
            let log_len = log.log.length;
            tx_effects_hash_input[offset] = log_len as Field;
            offset += 1;
            tx_effects_hash_input[offset] = log.contract_address.to_field();
            offset += 1;
            for k in 0..log_len {
                tx_effects_hash_input[offset + k] = log.log.fields[k];
            }
            offset += log_len;
        }
    }

    // CONTRACT CLASS LOGS
    let num_cc_logs = array_length_until(contract_class_logs, |log| log.log.length == 0);
    if num_cc_logs != 0 {
        tx_effects_hash_input[offset] = encode_blob_prefix(CONTRACT_CLASS_LOGS_PREFIX, num_cc_logs);
        offset += 1;

        for j in 0..num_cc_logs {
            let log = contract_class_logs[j];
            let log_len = log.log.length;
            // prefix this log with its field length
            tx_effects_hash_input[offset] = log_len as Field;
            offset += 1;
            // add its address (not using a .serialise here because it would involve expensive .concat)
            tx_effects_hash_input[offset] = log.contract_address.to_field();
            offset += 1;
            for k in 0..log_len {
                tx_effects_hash_input[offset] = log.log.fields[k];
                offset += 1;
            }
        }
    }

    // Now we know the number of fields appended, we can assign the first value:
    tx_effects_hash_input[0] = generate_tx_start_field(offset as Field, revert_code);

    (tx_effects_hash_input, offset)
}
