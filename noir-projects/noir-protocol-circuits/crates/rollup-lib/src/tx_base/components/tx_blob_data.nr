use crate::abis::TxEffect;
use dep::types::{
    abis::sponge_blob::SpongeBlob,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS, TX_START_PREFIX,
    },
    traits::ToField,
};

pub(crate) global MAX_TX_BLOB_DATA_SIZE_IN_FIELDS: u32 = 1 // tx start marker
    + 1 // tx hash
    + 1 // transaction fee
    + MAX_NOTE_HASHES_PER_TX
    + MAX_NULLIFIERS_PER_TX
    + MAX_L2_TO_L1_MSGS_PER_TX
    + MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2 // (*2 for leaf slot and value)
    + MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1) // (+1 for log length)
    + FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH
    + MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1); // (+1 for contract address)

pub struct TxEffectArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub public_data_writes: u32,
    pub private_logs: u32,
    pub contract_class_logs: u32,
}

// It's worth acknowledging that these values are all significant over-allocations.
// E.g. a single tx won't have anywhere near 2^16 nullifiers or 2^32 public log fields, and there are constants in
// kernel/rollup circuits which prescribe much smaller maximums.
// If you ever want to encode more information into the "tx start marker" (as the protocol changes) there's plenty of
// room to reduce these values.
global NUM_NOTE_HASH_BIT_SIZE: u32 = 16;
global NUM_NULLIFIER_BIT_SIZE: u32 = 16;
global NUM_L2_TO_L1_MSG_BIT_SIZE: u32 = 16;
global NUM_PUBLIC_DATA_WRITE_BIT_SIZE: u32 = 16;
global NUM_PRIVATE_LOG_BIT_SIZE: u32 = 16;
global PUBLIC_LOGS_LENGTH_BIT_SIZE: u32 = 32;
global CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE: u32 = 16;
global REVERT_CODE_BIT_SIZE: u32 = 8;
global NUM_BLOB_FIELDS_BIT_SIZE: u32 = 32;

/// Create the first field that marks the start of a tx. It's a concatenation of:
/// `TX_START_PREFIX` | `num_note_hashes` | `num_nullifiers` | `num_l2_to_l1_msgs` | `num_public_data_writes` |
/// `num_private_logs` | `num_public_log_fields` | `contract_class_log_length` | `revert_code` | `num_blob_fields`
///
/// `TX_START_PREFIX` occupies the bytes up to the point where `num_note_hashes` begins.
/// `num_blob_fields` occupies 4 bytes, allowing a maximum of 2 ** 32 fields.
/// `num_public_log_fields` occupies 4 bytes, allowing a maximum of 2 ** 32 fields.
/// `revert_code` occupies 1 byte.
/// Each of the remaining values occupies 2 bytes, allowing a maximum of 2 ** 16 elements each.
/// A test below ensures they do not exceed these limits.
pub fn create_tx_start_marker(
    num_blob_fields: u32,
    array_lengths: TxEffectArrayLengths,
    public_logs_length: u32,
    contract_class_log_length: u32,
    revert_code: u8,
) -> Field {
    let mut marker = num_blob_fields as Field;
    let mut shift = (1 << NUM_BLOB_FIELDS_BIT_SIZE as u64) as Field;
    marker += (revert_code as Field) * shift;
    shift *= (1 << REVERT_CODE_BIT_SIZE) as Field;
    // Note: There can be at most 1 contract class log per tx, so this is currently the length of the log.
    // If this changes, we need to update below to be `array_lengths.contract_class_logs`.
    marker += (contract_class_log_length as Field) * shift;
    shift *= (1 << CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) as Field;
    marker += (public_logs_length as Field) * shift;
    shift *= (1 << PUBLIC_LOGS_LENGTH_BIT_SIZE as u64) as Field;
    marker += (array_lengths.private_logs as Field) * shift;
    shift *= (1 << NUM_PRIVATE_LOG_BIT_SIZE) as Field;
    marker += (array_lengths.public_data_writes as Field) * shift;
    shift *= (1 << NUM_PUBLIC_DATA_WRITE_BIT_SIZE) as Field;
    marker += (array_lengths.l2_to_l1_msgs as Field) * shift;
    shift *= (1 << NUM_L2_TO_L1_MSG_BIT_SIZE) as Field;
    marker += (array_lengths.nullifiers as Field) * shift;
    shift *= (1 << NUM_NULLIFIER_BIT_SIZE) as Field;
    marker += (array_lengths.note_hashes as Field) * shift;
    shift *= (1 << NUM_NOTE_HASH_BIT_SIZE) as Field;
    marker += TX_START_PREFIX * shift;
    marker
}

pub fn append_tx_effect_to_sponge_blob(
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
) -> ([Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS], u32) {
    // Safety: This constructs the array of effects and is constrained below.
    let (tx_effects_hash_input, num_blob_fields) =
        unsafe { get_tx_effect_hash_input_helper(tx_effect, array_lengths) };

    // The first field marks the start of a tx. It contains:
    // - the total number of fields for this tx, including this first field.
    // - the individual number for each type of side effect.
    // - the revert code.
    //
    // Note: `num_blob_fields` is checked at the end against the offset.
    let expected_tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );
    assert_eq(tx_effects_hash_input[0], expected_tx_start_marker);

    assert_eq(tx_effects_hash_input[1], tx_effect.tx_hash);

    assert_eq(tx_effects_hash_input[2], tx_effect.transaction_fee);

    let mut offset = 3;

    let note_hashes = tx_effect.note_hashes;
    {
        let mut check_elt = true;
        for i in 0..note_hashes.len() {
            check_elt &= i != array_lengths.note_hashes;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + i], note_hashes[i]);
            }
        }
        offset += array_lengths.note_hashes;
    }

    let nullifiers = tx_effect.nullifiers;
    {
        let mut check_elt = true;
        for i in 0..nullifiers.len() {
            check_elt &= i != array_lengths.nullifiers;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + i], nullifiers[i]);
            }
        }
        offset += array_lengths.nullifiers;
    }

    let l2_to_l1_msgs = tx_effect.l2_to_l1_msgs;
    {
        let mut check_elt = true;
        for i in 0..l2_to_l1_msgs.len() {
            check_elt &= i != array_lengths.l2_to_l1_msgs;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + i], l2_to_l1_msgs[i]);
            }
        }
        offset += array_lengths.l2_to_l1_msgs;
    }

    let public_data_writes = tx_effect.public_data_writes;
    {
        let mut check_elt = true;
        for i in 0..public_data_writes.len() {
            check_elt &= i != array_lengths.public_data_writes;
            if check_elt {
                assert_eq(tx_effects_hash_input[offset + i * 2], public_data_writes[i].leaf_slot);
                assert_eq(tx_effects_hash_input[offset + i * 2 + 1], public_data_writes[i].value);
            }
        }
        offset += array_lengths.public_data_writes * 2;
    }

    let private_logs = tx_effect.private_logs;
    {
        let mut check_log = true;
        for i in 0..private_logs.len() {
            let private_log = private_logs[i];
            check_log &= i != array_lengths.private_logs;
            if check_log {
                assert_eq(tx_effects_hash_input[offset], private_log.length as Field);
                offset += 1;

                let mut check_elt = true;
                for j in 0..private_log.fields.len() {
                    check_elt &= j != private_log.length;
                    if check_elt {
                        assert_eq(tx_effects_hash_input[offset + j], private_log.fields[j]);
                    }
                }
                offset += private_log.length;
            }
        }
    }

    let public_logs = tx_effect.public_logs;
    {
        let mut check_log = true;
        for i in 0..public_logs.payload.len() {
            check_log &= i != public_logs.length;
            if check_log {
                assert_eq(tx_effects_hash_input[offset + i], public_logs.payload[i]);
            }
        }
        offset += public_logs.length;
    }

    let contract_class_logs = tx_effect.contract_class_logs;
    {
        let mut check_log = true;
        for i in 0..contract_class_logs.len() {
            let log = contract_class_logs[i];
            let log_len = log.log.length;
            check_log &= i != array_lengths.contract_class_logs;
            if check_log {
                assert_eq(tx_effects_hash_input[offset], log.contract_address.to_field());
                offset += 1;
            }
            let mut check_elt = true;
            for j in 0..log.log.fields.len() {
                check_elt &= j != log_len;
                if check_elt {
                    assert_eq(tx_effects_hash_input[offset + j], log.log.fields[j]);
                }
            }
            offset += log_len;
        }
    }

    // Validate that the number of fields appended to blob matches the hint given by the unconstrained function.
    assert_eq(offset, num_blob_fields);

    (tx_effects_hash_input, offset)
}

unconstrained fn get_tx_effect_hash_input_helper(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> ([Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS], u32) {
    let mut tx_effects_hash_input = [0; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS];

    // tx_effects_hash_input[0] is the tx start marker and is set at the end when the number of fields is known.

    tx_effects_hash_input[1] = tx_effect.tx_hash;

    tx_effects_hash_input[2] = tx_effect.transaction_fee;

    let mut offset = 3;

    let note_hashes = tx_effect.note_hashes;
    for i in 0..array_lengths.note_hashes {
        tx_effects_hash_input[offset + i] = note_hashes[i];
    }
    offset += array_lengths.note_hashes;

    let nullifiers = tx_effect.nullifiers;
    for i in 0..array_lengths.nullifiers {
        tx_effects_hash_input[offset + i] = nullifiers[i];
    }
    offset += array_lengths.nullifiers;

    let l2_to_l1_msgs = tx_effect.l2_to_l1_msgs;
    for i in 0..array_lengths.l2_to_l1_msgs {
        tx_effects_hash_input[offset + i] = l2_to_l1_msgs[i];
    }
    offset += array_lengths.l2_to_l1_msgs;

    let public_data_writes = tx_effect.public_data_writes;
    for i in 0..array_lengths.public_data_writes {
        tx_effects_hash_input[offset + i * 2] = public_data_writes[i].leaf_slot;
        tx_effects_hash_input[offset + i * 2 + 1] = public_data_writes[i].value;
    }
    offset += array_lengths.public_data_writes * 2;

    let private_logs = tx_effect.private_logs;
    for i in 0..array_lengths.private_logs {
        let log = private_logs[i];
        let log_len = log.length;
        tx_effects_hash_input[offset] = log_len as Field;
        offset += 1;

        for j in 0..log_len {
            tx_effects_hash_input[offset + j] = log.fields[j];
        }
        offset += log_len;
    }

    let public_logs = tx_effect.public_logs;
    for i in 0..public_logs.length {
        tx_effects_hash_input[offset + i] = public_logs.payload[i];
    }
    offset += public_logs.length;

    let contract_class_logs = tx_effect.contract_class_logs;
    for i in 0..array_lengths.contract_class_logs {
        let log = contract_class_logs[i];
        let log_len = log.log.length;
        tx_effects_hash_input[offset] = log.contract_address.to_field();
        offset += 1;

        for j in 0..log_len {
            tx_effects_hash_input[offset + j] = log.log.fields[j];
        }
        offset += log_len;
    }

    // Now we know the number of fields appended, we can assign the first value:
    tx_effects_hash_input[0] = create_tx_start_marker(
        offset,
        array_lengths,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );

    (tx_effects_hash_input, offset)
}

mod tests {
    use super::{
        CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE, create_tx_start_marker, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS,
        NUM_BLOB_FIELDS_BIT_SIZE, NUM_L2_TO_L1_MSG_BIT_SIZE, NUM_NOTE_HASH_BIT_SIZE,
        NUM_NULLIFIER_BIT_SIZE, NUM_PRIVATE_LOG_BIT_SIZE, NUM_PUBLIC_DATA_WRITE_BIT_SIZE,
        PUBLIC_LOGS_LENGTH_BIT_SIZE, TxEffectArrayLengths,
    };
    use types::constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        TX_START_PREFIX,
    };

    fn accumulate_bytes<let N: u32>(bytes: [u8; N], offset: u32, num_bytes: u32) -> Field {
        let mut accum = 0;
        let mut shift = 1;
        for i in 0..num_bytes {
            accum += bytes[offset + i] as Field * shift;
            shift *= 256;
        }
        accum
    }

    #[test]
    fn max_number_of_side_effects_does_not_exceed_limit() {
        // Ensure that each value fits into its allocated bits in the tx start marker.
        (MAX_TX_BLOB_DATA_SIZE_IN_FIELDS as Field).assert_max_bit_size::<NUM_BLOB_FIELDS_BIT_SIZE>();
        (MAX_NOTE_HASHES_PER_TX as Field).assert_max_bit_size::<NUM_NOTE_HASH_BIT_SIZE>();
        (MAX_NULLIFIERS_PER_TX as Field).assert_max_bit_size::<NUM_NULLIFIER_BIT_SIZE>();
        (MAX_L2_TO_L1_MSGS_PER_TX as Field).assert_max_bit_size::<NUM_L2_TO_L1_MSG_BIT_SIZE>();
        (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX as Field)
            .assert_max_bit_size::<NUM_PUBLIC_DATA_WRITE_BIT_SIZE>();
        (MAX_PRIVATE_LOGS_PER_TX as Field).assert_max_bit_size::<NUM_PRIVATE_LOG_BIT_SIZE>();
        (FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH as Field)
            .assert_max_bit_size::<PUBLIC_LOGS_LENGTH_BIT_SIZE>();

        // Note: The length of the contract class log is encoded in the tx start marker. If more than one contract class
        // log per tx is ever supported, the tx start marker must be updated to encode the number of contract class logs
        // instead, and extra field(s) should be added to the blobs for the log lengths.
        assert_eq(MAX_CONTRACT_CLASS_LOGS_PER_TX, 1);
        (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS as Field)
            .assert_max_bit_size::<CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE>();
    }

    #[test]
    fn correct_tx_start_marker() {
        let num_blob_fields = 5678;
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 11,
            nullifiers: 22,
            l2_to_l1_msgs: 33,
            public_data_writes: 44,
            private_logs: 55,
            contract_class_logs: 1,
        };
        let public_logs_length = 1234;
        let contract_class_log_length = 876;
        let revert_code = 99;

        let tx_start_marker = create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            public_logs_length,
            contract_class_log_length,
            revert_code,
        );

        let bytes: [u8; 32] = tx_start_marker.to_le_bytes();
        assert_eq(accumulate_bytes(bytes, 0, 4), 5678); // num_blob_fields
        assert_eq(accumulate_bytes(bytes, 4, 1), 99); // revert_code
        assert_eq(accumulate_bytes(bytes, 5, 2), 876); // contract_class_log_length
        assert_eq(accumulate_bytes(bytes, 7, 4), 1234); // public_logs_length
        assert_eq(accumulate_bytes(bytes, 11, 2), 55); // private_logs
        assert_eq(accumulate_bytes(bytes, 13, 2), 44); // public_data_writes
        assert_eq(accumulate_bytes(bytes, 15, 2), 33); // l2_to_l1_msgs
        assert_eq(accumulate_bytes(bytes, 17, 2), 22); // nullifiers
        assert_eq(accumulate_bytes(bytes, 19, 2), 11); // note_hashes
        assert_eq(accumulate_bytes(bytes, 21, 32 - 21), TX_START_PREFIX); // prefix

        let tx_start_marker_from_typescript =
            0x00000074785f7374617274000b00160021002c0037000004d2036c630000162e;
        assert_eq(tx_start_marker, tx_start_marker_from_typescript);
    }

    #[test]
    fn large_values_in_tx_start_marker_do_not_get_truncated() {
        let num_blob_fields = 0x98765432;
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 0x1122,
            nullifiers: 0x3344,
            l2_to_l1_msgs: 0x5566,
            public_data_writes: 0x7788,
            private_logs: 0x99aa,
            contract_class_logs: 1,
        };
        let public_logs_length = 0x12345678;
        let contract_class_log_length = 0xbbcc;
        let revert_code = 0x99;

        let tx_start_marker = create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            public_logs_length,
            contract_class_log_length,
            revert_code,
        );

        let bytes: [u8; 32] = tx_start_marker.to_le_bytes();
        assert_eq(accumulate_bytes(bytes, 0, 4), 0x98765432); // num_blob_fields
        assert_eq(accumulate_bytes(bytes, 4, 1), 0x99); // revert_code
        assert_eq(accumulate_bytes(bytes, 5, 2), 0xbbcc); // contract_class_logs
        assert_eq(accumulate_bytes(bytes, 7, 4), 0x12345678); // public_logs_length
        assert_eq(accumulate_bytes(bytes, 11, 2), 0x99aa); // private_logs
        assert_eq(accumulate_bytes(bytes, 13, 2), 0x7788); // public_data_writes
        assert_eq(accumulate_bytes(bytes, 15, 2), 0x5566); // l2_to_l1_msgs
        assert_eq(accumulate_bytes(bytes, 17, 2), 0x3344); // nullifiers
        assert_eq(accumulate_bytes(bytes, 19, 2), 0x1122); // note_hashes
        assert_eq(accumulate_bytes(bytes, 21, 32 - 21), TX_START_PREFIX); // prefix

        let large_tx_start_marker_from_typescript =
            0x00000074785f7374617274112233445566778899aa12345678bbcc9998765432;
        assert_eq(tx_start_marker, large_tx_start_marker_from_typescript);
    }
}
