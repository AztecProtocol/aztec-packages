use crate::abis::TxEffect;
use dep::types::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite, public_logs::PublicLogs, sponge_blob::SpongeBlob,
    },
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_LOGS_PREFIX,
        FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, L2_L1_MSGS_PREFIX, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTES_PREFIX,
        NULLIFIERS_PREFIX, PRIVATE_LOG_SIZE_IN_FIELDS, PRIVATE_LOGS_PREFIX,
        PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, PUBLIC_LOGS_LENGTH, PUBLIC_LOGS_PREFIX,
        REVERT_CODE_PREFIX, TX_FEE_PREFIX, TX_START_PREFIX,
    },
    traits::ToField,
};

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
// PUBLIC_LOGS_LENGTH
// MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 2) fields for contract class logs (+1 for length of log fields and +1 for contract address)
// 7 fields for prefixes for each of the above categories
pub(crate) global TX_EFFECTS_BLOB_HASH_INPUT_FIELDS: u32 = 1
    + 1
    + 1
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2
    + MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1)
    + PUBLIC_LOGS_LENGTH
    + MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 2)
    + 7;

pub struct TxEffectArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub public_data_writes: u32,
    pub private_logs: u32,
    pub contract_class_logs: u32,
}

pub(crate) fn append_tx_effect_to_sponge_blob(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
    start_sponge_blob: SpongeBlob,
) -> SpongeBlob {
    let (mut tx_effects_hash_input, num_blob_fields) =
        get_tx_effect_hash_input(tx_effect, array_lengths);

    // NB: using start.absorb & returning start caused issues in ghost values appearing in
    // base_rollup_inputs.start when using a fresh sponge. These only appeared when simulating via wasm.
    let mut end_sponge_blob = start_sponge_blob;

    end_sponge_blob.absorb(tx_effects_hash_input, num_blob_fields);

    end_sponge_blob
}

fn get_tx_effect_hash_input(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> ([Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS], u32) {
    tx_effect.transaction_fee.assert_max_bit_size::<29 * 8>();
    let TWO_POW_240 = 1766847064778384329583297500742918515827483896875618958121606201292619776;
    let prefixed_tx_fee: Field =
        (TX_FEE_PREFIX as Field) * TWO_POW_240 + (tx_effect.transaction_fee as Field);

    let note_hashes = tx_effect.note_hashes;
    let nullifiers = tx_effect.nullifiers;

    let public_data_writes = tx_effect.public_data_writes;
    let private_logs = tx_effect.private_logs;
    let public_logs = tx_effect.public_logs;
    let contract_class_logs = tx_effect.contract_class_logs;

    // Safety: This constructs the array of effects and is constrained below.
    let (tx_effects_hash_input, num_blob_fields) = unsafe {
        get_tx_effect_hash_input_helper(
            tx_effect.tx_hash,
            prefixed_tx_fee,
            tx_effect.note_hashes,
            tx_effect.nullifiers,
            tx_effect.l2_to_l1_msgs,
            public_data_writes,
            private_logs,
            public_logs,
            contract_class_logs,
            tx_effect.revert_code as Field,
            array_lengths,
        )
    };

    let mut offset = 0;

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

    // NOTE HASHES
    if array_lengths.note_hashes != 0 {
        let mut check_elt = true;
        let notes_prefix = encode_blob_prefix(NOTES_PREFIX, array_lengths.note_hashes);
        assert_eq(tx_effects_hash_input[offset], notes_prefix);
        offset += 1;

        for j in 0..MAX_NOTE_HASHES_PER_TX {
            check_elt &= j != array_lengths.note_hashes;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], note_hashes[j]);
            }
        }
        offset += array_lengths.note_hashes;
    }

    // NULLIFIERS
    if array_lengths.nullifiers != 0 {
        let mut check_elt = true;
        let nullifiers_prefix = encode_blob_prefix(NULLIFIERS_PREFIX, array_lengths.nullifiers);
        assert_eq(tx_effects_hash_input[offset], nullifiers_prefix);
        offset += 1;

        for j in 0..MAX_NULLIFIERS_PER_TX {
            check_elt &= j != array_lengths.nullifiers;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], nullifiers[j]);
            }
        }
        offset += array_lengths.nullifiers;
    }

    // L2 TO L1 MESSAGES
    if array_lengths.l2_to_l1_msgs != 0 {
        let mut check_elt = true;
        let l2_to_l1_msgs_prefix =
            encode_blob_prefix(L2_L1_MSGS_PREFIX, array_lengths.l2_to_l1_msgs);
        assert_eq(tx_effects_hash_input[offset], l2_to_l1_msgs_prefix);
        offset += 1;

        for j in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            check_elt &= j != array_lengths.l2_to_l1_msgs;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j], tx_effect.l2_to_l1_msgs[j]);
            }
        }
        offset += array_lengths.l2_to_l1_msgs;
    }

    // PUBLIC DATA WRITES
    if array_lengths.public_data_writes != 0 {
        let mut check_elt = true;
        let public_data_update_requests_prefix = encode_blob_prefix(
            PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
            array_lengths.public_data_writes,
        );
        assert_eq(tx_effects_hash_input[offset], public_data_update_requests_prefix);
        offset += 1;
        for j in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            check_elt &= j != array_lengths.public_data_writes;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + j * 2], public_data_writes[j].leaf_slot);
                assert_eq(tx_effects_hash_input[offset + j * 2 + 1], public_data_writes[j].value);
            }
        }
        offset += array_lengths.public_data_writes * 2;
    }

    // PRIVATE_LOGS
    if array_lengths.private_logs != 0 {
        let private_logs_prefix =
            encode_blob_prefix(PRIVATE_LOGS_PREFIX, array_lengths.private_logs);
        assert_eq(tx_effects_hash_input[offset], private_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..MAX_PRIVATE_LOGS_PER_TX {
            check_log &= j != array_lengths.private_logs;
            let log = private_logs[j];
            if check_log {
                assert(log.length <= PRIVATE_LOG_SIZE_IN_FIELDS, "Private log length exceeds max");
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
    if public_logs.length != 0 {
        let public_logs_prefix = encode_blob_prefix(PUBLIC_LOGS_PREFIX, public_logs.length);
        assert_eq(tx_effects_hash_input[offset], public_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH {
            check_log &= j != public_logs.length;
            let public_log_field = public_logs.payload[j];
            if check_log {
                assert_eq(tx_effects_hash_input[offset], public_log_field);
                offset += 1;
            }
        }
    }

    // CONTRACT CLASS LOGS
    if array_lengths.contract_class_logs != 0 {
        let contract_class_logs_prefix = encode_blob_prefix(
            CONTRACT_CLASS_LOGS_PREFIX,
            array_lengths.contract_class_logs,
        );
        assert_eq(tx_effects_hash_input[offset], contract_class_logs_prefix);
        offset += 1;

        let mut check_log = true;
        for j in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
            check_log &= j != array_lengths.contract_class_logs;
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

unconstrained fn get_tx_effect_hash_input_helper(
    tx_hash: Field,
    prefixed_tx_fee: Field,
    note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    public_data_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    public_logs: PublicLogs,
    contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    revert_code: Field,
    array_lengths: TxEffectArrayLengths,
) -> ([Field; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS], u32) {
    let mut tx_effects_hash_input = [0; TX_EFFECTS_BLOB_HASH_INPUT_FIELDS];

    // Public writes are the concatenation of all non-empty user update requests and protocol update requests, then padded with zeroes.
    // The incoming all_public_data_update_requests may have empty update requests in the middle, so we move those to the end of the array.

    tx_effects_hash_input[1] = tx_hash;

    // TX FEE
    // Using 29 bytes to encompass all reasonable fee lengths
    tx_effects_hash_input[2] = prefixed_tx_fee;

    let mut offset = 3;

    // NOTE HASHES
    let array_len = array_lengths.note_hashes;
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
    let array_len = array_lengths.nullifiers;
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
    let array_len = array_lengths.l2_to_l1_msgs;
    if array_len != 0 {
        let l2_to_l1_msgs_prefix = encode_blob_prefix(L2_L1_MSGS_PREFIX, array_len);
        tx_effects_hash_input[offset] = l2_to_l1_msgs_prefix;
        offset += 1;

        for j in 0..array_len {
            tx_effects_hash_input[offset + j] = l2_to_l1_msgs[j];
        }
        offset += array_len;
    }

    // PUBLIC DATA WRITES
    let array_len = array_lengths.public_data_writes;
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
    let num_private_logs = array_lengths.private_logs;
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
    let num_public_log_fields = public_logs.length;
    if num_public_log_fields != 0 {
        tx_effects_hash_input[offset] =
            encode_blob_prefix(PUBLIC_LOGS_PREFIX, num_public_log_fields);
        offset += 1;

        for j in 0..num_public_log_fields {
            tx_effects_hash_input[offset] = public_logs.payload[j];
            offset += 1;
        }
    }

    // CONTRACT CLASS LOGS
    let num_cc_logs = array_lengths.contract_class_logs;
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
