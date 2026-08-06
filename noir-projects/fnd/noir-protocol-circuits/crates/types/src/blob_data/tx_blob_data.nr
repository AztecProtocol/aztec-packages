use crate::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite,
    },
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS,
        PRIVATE_LOG_SIZE_IN_FIELDS, TX_START_PREFIX,
    },
    traits::ToField,
};
use super::tx_effect::TxEffect;
use std::static_assert;

pub global PUBLIC_DATA_WRITES_BLOB_FIELDS_LENGTH: u32 =
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2;
pub global PRIVATE_LOGS_BLOB_FIELDS_LENGTH: u32 =
    MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1);
pub global CONTRACT_CLASS_LOGS_BLOB_FIELDS_LENGTH: u32 =
    MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

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
global PRIVATE_LOGS_LENGTH_BIT_SIZE: u32 = 16;
global PUBLIC_LOGS_LENGTH_BIT_SIZE: u32 = 32;
global CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE: u32 = 16;
global REVERT_CODE_BIT_SIZE: u32 = 8;
global NUM_BLOB_FIELDS_BIT_SIZE: u32 = 32;
global TX_START_PREFIX_BIT_SIZE: u32 = 32;

/// Create the first field that marks the start of a tx. It's a concatenation of:
/// `TX_START_PREFIX` | `num_note_hashes` | `num_nullifiers` | `num_l2_to_l1_msgs` | `num_public_data_writes` |
/// `num_private_logs` | `private_logs_length` | `public_logs_length` | `contract_class_log_length` | `revert_code` |
/// `num_blob_fields`
///
/// `TX_START_PREFIX` occupies the bytes up to the point where `num_note_hashes` begins.
/// `num_blob_fields` occupies 4 bytes, allowing a maximum of 2 ** 32 fields.
/// `public_logs_length` occupies 4 bytes, allowing a maximum of 2 ** 32 fields.
/// `revert_code` occupies 1 byte.
/// Each of the remaining values occupies 2 bytes, allowing a maximum of 2 ** 16 elements each.
/// A test below ensures they do not exceed these limits.
pub fn create_tx_start_marker(
    num_blob_fields: u32,
    array_lengths: TxEffectArrayLengths,
    private_logs_length: u32,
    public_logs_length: u32,
    contract_class_log_length: u32, // Assumed to be a u16, checked on tail to be less than CONTRACT_CLASS_LOG_SIZE_IN_FIELDS
    revert_code: u8,
) -> Field {
    static_assert(
        NUM_BLOB_FIELDS_BIT_SIZE
            + REVERT_CODE_BIT_SIZE
            + CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE
            + PUBLIC_LOGS_LENGTH_BIT_SIZE
            + PRIVATE_LOGS_LENGTH_BIT_SIZE
            + NUM_PRIVATE_LOG_BIT_SIZE
            + NUM_PUBLIC_DATA_WRITE_BIT_SIZE
            + NUM_L2_TO_L1_MSG_BIT_SIZE
            + NUM_NULLIFIER_BIT_SIZE
            + NUM_NOTE_HASH_BIT_SIZE
            + TX_START_PREFIX_BIT_SIZE
            <= 253,
        "These bit-sizes don't fit within a field anymore. Have you changed a constant?",
    );

    let num_blob_fields_field = num_blob_fields as Field;
    num_blob_fields_field.assert_max_bit_size::<NUM_BLOB_FIELDS_BIT_SIZE>();
    let mut marker = num_blob_fields_field;
    let mut shift = (1 << NUM_BLOB_FIELDS_BIT_SIZE as u64) as Field;

    let revert_code_field = revert_code as Field;
    revert_code_field.assert_max_bit_size::<REVERT_CODE_BIT_SIZE>();
    marker += revert_code_field * shift;
    shift *= (1 << REVERT_CODE_BIT_SIZE) as Field;

    // Note: There can be at most 1 contract class log per tx, so this is currently the length of the log.
    // If this changes, we need to update below to be `array_lengths.contract_class_logs`.
    let contract_class_log_length_field = contract_class_log_length as Field;
    contract_class_log_length_field.assert_max_bit_size::<CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE>();
    marker += contract_class_log_length_field * shift;
    shift *= (1 << CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE) as Field;

    let public_logs_length_field = public_logs_length as Field;
    public_logs_length_field.assert_max_bit_size::<PUBLIC_LOGS_LENGTH_BIT_SIZE>();
    marker += public_logs_length_field * shift;
    shift *= (1 << PUBLIC_LOGS_LENGTH_BIT_SIZE as u64) as Field;

    // This is the length of all private logs (concatenated) that will be inserted into the blob.
    // Each private_log conveys its own `length` field; all such `length` fields are included in this
    // private_logs_length value.
    let private_logs_length_field = private_logs_length as Field;
    private_logs_length_field.assert_max_bit_size::<PRIVATE_LOGS_LENGTH_BIT_SIZE>();
    marker += private_logs_length_field * shift;
    shift *= (1 << PRIVATE_LOGS_LENGTH_BIT_SIZE) as Field;

    let num_private_logs_field = array_lengths.private_logs as Field;
    num_private_logs_field.assert_max_bit_size::<NUM_PRIVATE_LOG_BIT_SIZE>();
    marker += num_private_logs_field * shift;
    shift *= (1 << NUM_PRIVATE_LOG_BIT_SIZE) as Field;

    let num_public_data_writes_field = array_lengths.public_data_writes as Field;
    num_public_data_writes_field.assert_max_bit_size::<NUM_PUBLIC_DATA_WRITE_BIT_SIZE>();
    marker += num_public_data_writes_field * shift;
    shift *= (1 << NUM_PUBLIC_DATA_WRITE_BIT_SIZE) as Field;

    let num_l2_to_l1_msgs_field = array_lengths.l2_to_l1_msgs as Field;
    num_l2_to_l1_msgs_field.assert_max_bit_size::<NUM_L2_TO_L1_MSG_BIT_SIZE>();
    marker += num_l2_to_l1_msgs_field * shift;
    shift *= (1 << NUM_L2_TO_L1_MSG_BIT_SIZE) as Field;

    let num_nullifiers_field = array_lengths.nullifiers as Field;
    num_nullifiers_field.assert_max_bit_size::<NUM_NULLIFIER_BIT_SIZE>();
    marker += num_nullifiers_field * shift;
    shift *= (1 << NUM_NULLIFIER_BIT_SIZE) as Field;

    let num_note_hashes_field = array_lengths.note_hashes as Field;
    num_note_hashes_field.assert_max_bit_size::<NUM_NOTE_HASH_BIT_SIZE>();
    marker += num_note_hashes_field * shift;
    shift *= (1 << NUM_NOTE_HASH_BIT_SIZE) as Field;

    marker += TX_START_PREFIX * shift;
    marker
}

/// The blob encoding of a tx effect's `public_data_writes`: the leaf slot and value of each write.
///
/// @returns the encoded fields, zero-padded, and the number of encoded fields.
pub fn create_public_data_writes_blob_fields(
    public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    num_public_data_writes: u32,
) -> ([Field; PUBLIC_DATA_WRITES_BLOB_FIELDS_LENGTH], u32) {
    let mut blob_fields = [0; PUBLIC_DATA_WRITES_BLOB_FIELDS_LENGTH];

    let mut include_write = true;
    for i in 0..public_data_writes.len() {
        include_write &= i != num_public_data_writes;
        if include_write {
            blob_fields[i * 2] = public_data_writes[i].leaf_slot;
            blob_fields[i * 2 + 1] = public_data_writes[i].value;
        }
    }

    (blob_fields, num_public_data_writes * 2)
}

/// The blob encoding of a tx effect's `private_logs`: for each log, its length followed by its fields.
///
/// @returns the encoded fields, zero-padded, and the number of encoded fields (the sum of all log lengths plus one
/// length field per log).
pub fn create_private_logs_blob_fields(
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    num_private_logs: u32,
) -> ([Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH], u32) {
    let mut blob_fields = [0; PRIVATE_LOGS_BLOB_FIELDS_LENGTH];

    let mut offset = 0;
    let mut include_log = true;
    for i in 0..private_logs.len() {
        include_log &= i != num_private_logs;
        if include_log {
            let log = private_logs[i];
            blob_fields[offset] = log.length as Field;
            offset += 1;

            let mut include_elt = true;
            for j in 0..log.fields.len() {
                include_elt &= j != log.length;
                if include_elt {
                    blob_fields[offset + j] = log.fields[j];
                }
            }
            offset += log.length;
        }
    }

    (blob_fields, offset)
}

/// The blob encoding of a tx effect's `contract_class_logs`: for each log, its contract address followed by its
/// fields. Note the log length is not encoded here: it is carried by the tx start marker.
///
/// @returns the encoded fields, zero-padded, and the number of encoded fields.
pub fn create_contract_class_logs_blob_fields(
    contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    num_contract_class_logs: u32,
) -> ([Field; CONTRACT_CLASS_LOGS_BLOB_FIELDS_LENGTH], u32) {
    let mut blob_fields = [0; CONTRACT_CLASS_LOGS_BLOB_FIELDS_LENGTH];

    let mut offset = 0;
    let mut include_log = true;
    for i in 0..contract_class_logs.len() {
        include_log &= i != num_contract_class_logs;
        if include_log {
            let log = contract_class_logs[i];
            blob_fields[offset] = log.contract_address.to_field();
            offset += 1;

            let mut include_elt = true;
            for j in 0..log.log.fields.len() {
                include_elt &= j != log.log.length;
                if include_elt {
                    blob_fields[offset + j] = log.log.fields[j];
                }
            }
            offset += log.log.length;
        }
    }

    (blob_fields, offset)
}

pub fn create_tx_blob_data(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> ([Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS], u32) {
    // Safety: This constructs the array of effects and is constrained below.
    let (tx_blob_fields, num_blob_fields, private_logs_length) =
        unsafe { get_tx_blob_fields_unsafe(tx_effect, array_lengths) };

    // The first field marks the start of a tx. It contains:
    // - the total number of fields for this tx, including this first field.
    // - the individual number for each type of side effect.
    // - the revert code.
    //
    // Note:
    // - `num_blob_fields` is checked at the end against the offset.
    // - `private_logs_length` is checked below after validating the private logs.
    let expected_tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        private_logs_length,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );
    assert_eq(
        tx_blob_fields[0],
        expected_tx_start_marker,
        "Incorrect tx start marker in blob data",
    );

    assert_eq(tx_blob_fields[1], tx_effect.tx_hash, "Incorrect tx hash in blob data");

    assert_eq(
        tx_blob_fields[2],
        tx_effect.transaction_fee,
        "Incorrect transaction fee in blob data",
    );

    let mut offset = 3;

    let note_hashes = tx_effect.note_hashes;
    {
        let mut check_elt = true;
        for i in 0..note_hashes.len() {
            check_elt &= i != array_lengths.note_hashes;
            if check_elt {
                assert_eq(
                    tx_blob_fields[offset + i],
                    note_hashes[i],
                    "Incorrect note hash in blob data",
                );
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
                assert_eq(
                    tx_blob_fields[offset + i],
                    nullifiers[i],
                    "Incorrect nullifier in blob data",
                );
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
                assert_eq(
                    tx_blob_fields[offset + i],
                    l2_to_l1_msgs[i],
                    "Incorrect L2 to L1 message in blob data",
                );
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
                assert_eq(
                    tx_blob_fields[offset + i * 2],
                    public_data_writes[i].leaf_slot,
                    "Incorrect public data write leaf slot in blob data",
                );
                assert_eq(
                    tx_blob_fields[offset + i * 2 + 1],
                    public_data_writes[i].value,
                    "Incorrect public data write value in blob data",
                );
            }
        }
        offset += array_lengths.public_data_writes * 2;
    }

    let private_logs = tx_effect.private_logs;
    let private_log_start_index = offset;
    {
        let mut check_log = true;
        for i in 0..private_logs.len() {
            let private_log = private_logs[i];
            check_log &= i != array_lengths.private_logs;
            if check_log {
                assert_eq(
                    tx_blob_fields[offset],
                    private_log.length as Field,
                    "Incorrect private log length in blob data",
                );
                offset += 1;

                let mut check_elt = true;
                for j in 0..private_log.fields.len() {
                    check_elt &= j != private_log.length;
                    if check_elt {
                        assert_eq(
                            tx_blob_fields[offset + j],
                            private_log.fields[j],
                            "Incorrect private log field in blob data",
                        );
                    }
                }
                offset += private_log.length;
            }
        }
    }
    assert_eq(
        offset,
        private_log_start_index + private_logs_length + array_lengths.private_logs,
        "Incorrect private logs length in tx start marker",
    );

    let public_logs = tx_effect.public_logs;
    {
        let mut check_log = true;
        for i in 0..public_logs.payload.len() {
            check_log &= i != public_logs.length;
            if check_log {
                assert_eq(
                    tx_blob_fields[offset + i],
                    public_logs.payload[i],
                    "Incorrect public log field in blob data",
                );
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
                assert_eq(
                    tx_blob_fields[offset],
                    log.contract_address.to_field(),
                    "Incorrect contract class log contract address in blob data",
                );
                offset += 1;
            }
            let mut check_elt = true;
            for j in 0..log.log.fields.len() {
                check_elt &= j != log_len;
                if check_elt {
                    assert_eq(
                        tx_blob_fields[offset + j],
                        log.log.fields[j],
                        "Incorrect contract class log field in blob data",
                    );
                }
            }
            offset += log_len;
        }
    }

    // Validate that the number of fields appended to blob matches the hint given by the unconstrained function.
    assert_eq(offset, num_blob_fields, "Incorrect number of blob fields in tx start marker");

    (tx_blob_fields, offset)
}

unconstrained fn get_tx_blob_fields_unsafe(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> ([Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS], u32, u32) {
    let mut tx_blob_fields = [0; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS];

    // tx_blob_fields[0] is the tx start marker and is set at the end when the number of fields is known.

    tx_blob_fields[1] = tx_effect.tx_hash;

    tx_blob_fields[2] = tx_effect.transaction_fee;

    let mut offset = 3;

    let note_hashes = tx_effect.note_hashes;
    for i in 0..array_lengths.note_hashes {
        tx_blob_fields[offset + i] = note_hashes[i];
    }
    offset += array_lengths.note_hashes;

    let nullifiers = tx_effect.nullifiers;
    for i in 0..array_lengths.nullifiers {
        tx_blob_fields[offset + i] = nullifiers[i];
    }
    offset += array_lengths.nullifiers;

    let l2_to_l1_msgs = tx_effect.l2_to_l1_msgs;
    for i in 0..array_lengths.l2_to_l1_msgs {
        tx_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += array_lengths.l2_to_l1_msgs;

    let (public_data_write_fields, num_public_data_write_fields) = create_public_data_writes_blob_fields(
        tx_effect.public_data_writes,
        array_lengths.public_data_writes,
    );
    for i in 0..num_public_data_write_fields {
        tx_blob_fields[offset + i] = public_data_write_fields[i];
    }
    offset += num_public_data_write_fields;

    let (private_log_fields, num_private_log_fields) =
        create_private_logs_blob_fields(tx_effect.private_logs, array_lengths.private_logs);
    for i in 0..num_private_log_fields {
        tx_blob_fields[offset + i] = private_log_fields[i];
    }
    offset += num_private_log_fields;
    // Each log contributes a length field on top of its fields.
    let private_logs_length = num_private_log_fields - array_lengths.private_logs;

    let public_logs = tx_effect.public_logs;
    for i in 0..public_logs.length {
        tx_blob_fields[offset + i] = public_logs.payload[i];
    }
    offset += public_logs.length;

    let (contract_class_log_fields, num_contract_class_log_fields) = create_contract_class_logs_blob_fields(
        tx_effect.contract_class_logs,
        array_lengths.contract_class_logs,
    );
    for i in 0..num_contract_class_log_fields {
        tx_blob_fields[offset + i] = contract_class_log_fields[i];
    }
    offset += num_contract_class_log_fields;

    // Now we know the number of fields appended, we can assign the first value:
    tx_blob_fields[0] = create_tx_start_marker(
        offset,
        array_lengths,
        private_logs_length,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );

    (tx_blob_fields, offset, private_logs_length)
}

mod tests {
    use crate::constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        MAX_TX_BLOB_DATA_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS, TX_START_PREFIX,
    };
    use super::{
        CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE, create_tx_start_marker, NUM_BLOB_FIELDS_BIT_SIZE,
        NUM_L2_TO_L1_MSG_BIT_SIZE, NUM_NOTE_HASH_BIT_SIZE, NUM_NULLIFIER_BIT_SIZE,
        NUM_PRIVATE_LOG_BIT_SIZE, NUM_PUBLIC_DATA_WRITE_BIT_SIZE, PRIVATE_LOGS_LENGTH_BIT_SIZE,
        PUBLIC_LOGS_LENGTH_BIT_SIZE, TX_START_PREFIX_BIT_SIZE, TxEffectArrayLengths,
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
        // Ensure that each constant fits into its allocated bits in the tx start marker.
        TX_START_PREFIX.assert_max_bit_size::<TX_START_PREFIX_BIT_SIZE>();
        (MAX_TX_BLOB_DATA_SIZE_IN_FIELDS as Field).assert_max_bit_size::<NUM_BLOB_FIELDS_BIT_SIZE>();
        (MAX_NOTE_HASHES_PER_TX as Field).assert_max_bit_size::<NUM_NOTE_HASH_BIT_SIZE>();
        (MAX_NULLIFIERS_PER_TX as Field).assert_max_bit_size::<NUM_NULLIFIER_BIT_SIZE>();
        (MAX_L2_TO_L1_MSGS_PER_TX as Field).assert_max_bit_size::<NUM_L2_TO_L1_MSG_BIT_SIZE>();
        (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX as Field)
            .assert_max_bit_size::<NUM_PUBLIC_DATA_WRITE_BIT_SIZE>();
        (MAX_PRIVATE_LOGS_PER_TX as Field).assert_max_bit_size::<NUM_PRIVATE_LOG_BIT_SIZE>();
        (MAX_PRIVATE_LOGS_PER_TX as Field * PRIVATE_LOG_SIZE_IN_FIELDS as Field)
            .assert_max_bit_size::<PRIVATE_LOGS_LENGTH_BIT_SIZE>();
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
        let private_logs_length = 789;
        let public_logs_length = 1234;
        let contract_class_log_length = 876;
        let revert_code = 99;

        let tx_start_marker = create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            private_logs_length,
            public_logs_length,
            contract_class_log_length,
            revert_code,
        );

        let bytes: [u8; 32] = tx_start_marker.to_le_bytes();
        assert_eq(accumulate_bytes(bytes, 0, 4), 5678); // num_blob_fields
        assert_eq(accumulate_bytes(bytes, 4, 1), 99); // revert_code
        assert_eq(accumulate_bytes(bytes, 5, 2), 876); // contract_class_log_length
        assert_eq(accumulate_bytes(bytes, 7, 4), 1234); // public_logs_length
        assert_eq(accumulate_bytes(bytes, 11, 2), 789); // private_logs_length
        assert_eq(accumulate_bytes(bytes, 13, 2), 55); // num_private_logs
        assert_eq(accumulate_bytes(bytes, 15, 2), 44); // num_public_data_writes
        assert_eq(accumulate_bytes(bytes, 17, 2), 33); // num_l2_to_l1_msgs
        assert_eq(accumulate_bytes(bytes, 19, 2), 22); // num_nullifiers
        assert_eq(accumulate_bytes(bytes, 21, 2), 11); // num_note_hashes
        assert_eq(accumulate_bytes(bytes, 23, 32 - 23), TX_START_PREFIX); // prefix

        // Generated from yarn-project/blob-lib/src/encoding/tx_start_marker.test.ts
        let tx_start_marker_from_typescript =
            0x00000000009c707518000b00160021002c00370315000004d2036c630000162e;

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
        let private_logs_length = 0xddee;
        let public_logs_length = 0x12345678;
        let contract_class_log_length = 0xbbcc;
        let revert_code = 0x99;

        let tx_start_marker = create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            private_logs_length,
            public_logs_length,
            contract_class_log_length,
            revert_code,
        );

        let bytes: [u8; 32] = tx_start_marker.to_le_bytes();
        assert_eq(accumulate_bytes(bytes, 0, 4), 0x98765432); // num_blob_fields
        assert_eq(accumulate_bytes(bytes, 4, 1), 0x99); // revert_code
        assert_eq(accumulate_bytes(bytes, 5, 2), 0xbbcc); // contract_class_logs
        assert_eq(accumulate_bytes(bytes, 7, 4), 0x12345678); // public_logs_length
        assert_eq(accumulate_bytes(bytes, 11, 2), 0xddee); // private_logs_length
        assert_eq(accumulate_bytes(bytes, 13, 2), 0x99aa); // num_private_logs
        assert_eq(accumulate_bytes(bytes, 15, 2), 0x7788); // num_public_data_writes
        assert_eq(accumulate_bytes(bytes, 17, 2), 0x5566); // num_l2_to_l1_msgs
        assert_eq(accumulate_bytes(bytes, 19, 2), 0x3344); // num_nullifiers
        assert_eq(accumulate_bytes(bytes, 21, 2), 0x1122); // num_note_hashes
        assert_eq(accumulate_bytes(bytes, 23, 32 - 23), TX_START_PREFIX); // prefix

        // Generated from yarn-project/blob-lib/src/encoding/tx_start_marker.test.ts
        let large_tx_start_marker_from_typescript =
            0x00000000009c707518112233445566778899aaddee12345678bbcc9998765432;

        assert_eq(tx_start_marker, large_tx_start_marker_from_typescript);
    }
}
