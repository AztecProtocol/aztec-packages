use crate::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite,
    },
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS, TX_START_PREFIX,
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

pub struct TxBlobDataSections {
    pub tx_start_marker: Field,
    pub public_data_write_fields: [Field; PUBLIC_DATA_WRITES_BLOB_FIELDS_LENGTH],
    pub num_public_data_write_fields: u32,
    pub private_log_fields: [Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH],
    pub num_private_log_fields: u32,
    pub contract_class_log_fields: [Field; CONTRACT_CLASS_LOGS_BLOB_FIELDS_LENGTH],
    pub num_contract_class_log_fields: u32,
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
/// The encoding is built by an unconstrained hint and then verified element by element, rather than being written
/// directly. Because each log's position depends on the lengths of the preceding logs, writing it directly would
/// mean writes at run-time offsets, which barretenberg lowers to a RAM block whose access-count range constraint
/// caps out at `2^16 - 1` — far below the ~72k accesses of this array. Verifying a hint instead only ever reads at
/// run-time offsets, which becomes an (uncapped) ROM block.
///
/// Only the first `num_blob_fields` returned fields are constrained; the padding beyond them is unconstrained, so
/// callers must not read past the returned length.
///
/// Every log length is constrained locally before it is used as a runtime offset. Otherwise the verification loop
/// would check only `fields.len()` elements but advance `offset` by the oversized length, leaving skipped blob fields
/// unconstrained.
///
/// @returns the encoded fields, zero-padded, and the number of encoded fields (the sum of all log lengths plus one
/// length field per log).
pub fn create_private_logs_blob_fields(
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    num_private_logs: u32,
) -> ([Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH], u32) {
    // Safety: every field up to `num_blob_fields` is constrained against `private_logs` below, and
    // `num_blob_fields` is checked against the offset the verified encoding ends at.
    let (blob_fields, num_blob_fields) =
        unsafe { get_private_logs_blob_fields_unsafe(private_logs, num_private_logs) };

    validate_private_logs_blob_fields(private_logs, num_private_logs, blob_fields, num_blob_fields);

    (blob_fields, num_blob_fields)
}

fn validate_private_logs_blob_fields(
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    num_private_logs: u32,
    blob_fields: [Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH],
    num_blob_fields: u32,
) {
    let mut offset = 0;
    let mut include_log = true;
    for i in 0..private_logs.len() {
        include_log &= i != num_private_logs;
        if include_log {
            let log = private_logs[i];
            assert(log.length <= PRIVATE_LOG_SIZE_IN_FIELDS, "Private log length exceeds maximum");
            assert_eq(
                blob_fields[offset],
                log.length as Field,
                "Incorrect private log length in blob data",
            );
            offset += 1;

            let mut include_elt = true;
            for j in 0..log.fields.len() {
                include_elt &= j != log.length;
                if include_elt {
                    assert_eq(
                        blob_fields[offset + j],
                        log.fields[j],
                        "Incorrect private log field in blob data",
                    );
                }
            }
            offset += log.length;
        }
    }

    assert_eq(offset, num_blob_fields, "Incorrect number of private log fields in blob data");
}

unconstrained fn get_private_logs_blob_fields_unsafe(
    private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    num_private_logs: u32,
) -> ([Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH], u32) {
    let mut blob_fields = [0; PRIVATE_LOGS_BLOB_FIELDS_LENGTH];

    let mut offset = 0;
    for i in 0..num_private_logs {
        let log = private_logs[i];
        blob_fields[offset] = log.length as Field;
        offset += 1;

        for j in 0..log.length {
            blob_fields[offset + j] = log.fields[j];
        }
        offset += log.length;
    }

    (blob_fields, offset)
}

/// The blob encoding of a tx effect's `contract_class_logs`: for each log, its contract address followed by its
/// fields. Note the log length is not encoded here: it is carried by the tx start marker.
///
/// Because `MAX_CONTRACT_CLASS_LOGS_PER_TX` is 1, every index written below is a compile-time constant. If that
/// constant is ever raised, the writes become run-time offsets and lower to a barretenberg RAM block whose
/// access-count range constraint caps at `2^16 - 1`; follow `create_private_logs_blob_fields` and verify an
/// unconstrained hint with reads instead.
///
/// Each log length is constrained locally before it advances the encoded offset.
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
            assert(
                log.log.length <= CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
                "Contract class log length exceeds maximum",
            );
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

pub fn create_tx_blob_data_sections(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> TxBlobDataSections {
    let (public_data_write_fields, num_public_data_write_fields) = create_public_data_writes_blob_fields(
        tx_effect.public_data_writes,
        array_lengths.public_data_writes,
    );
    let (private_log_fields, num_private_log_fields) =
        create_private_logs_blob_fields(tx_effect.private_logs, array_lengths.private_logs);
    let (contract_class_log_fields, num_contract_class_log_fields) = create_contract_class_logs_blob_fields(
        tx_effect.contract_class_logs,
        array_lengths.contract_class_logs,
    );

    // The three fixed fields are the tx start marker, tx hash, and transaction fee.
    let num_blob_fields = 3
        + array_lengths.note_hashes
        + array_lengths.nullifiers
        + array_lengths.l2_to_l1_msgs
        + num_public_data_write_fields
        + num_private_log_fields
        + tx_effect.public_logs.length
        + num_contract_class_log_fields;
    let private_logs_length = num_private_log_fields - array_lengths.private_logs;
    let tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        private_logs_length,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );

    TxBlobDataSections {
        tx_start_marker,
        public_data_write_fields,
        num_public_data_write_fields,
        private_log_fields,
        num_private_log_fields,
        contract_class_log_fields,
        num_contract_class_log_fields,
    }
}

mod tests {
    use crate::{
        abis::{contract_class_log::ContractClassLog, log::Log, private_log::PrivateLog},
        address::AztecAddress,
        traits::{Empty, FromField},
    };
    use crate::constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        MAX_TX_BLOB_DATA_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS, TX_START_PREFIX,
    };
    use super::{
        CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE, create_contract_class_logs_blob_fields,
        create_tx_start_marker, NUM_BLOB_FIELDS_BIT_SIZE, NUM_L2_TO_L1_MSG_BIT_SIZE,
        NUM_NOTE_HASH_BIT_SIZE, NUM_NULLIFIER_BIT_SIZE, NUM_PRIVATE_LOG_BIT_SIZE,
        NUM_PUBLIC_DATA_WRITE_BIT_SIZE, PRIVATE_LOGS_BLOB_FIELDS_LENGTH,
        PRIVATE_LOGS_LENGTH_BIT_SIZE, PUBLIC_LOGS_LENGTH_BIT_SIZE, TX_START_PREFIX_BIT_SIZE,
        TxEffectArrayLengths, validate_private_logs_blob_fields,
    };

    fn private_logs_fixture() -> ([PrivateLog; MAX_PRIVATE_LOGS_PER_TX], [Field; PRIVATE_LOGS_BLOB_FIELDS_LENGTH]) {
        let mut private_logs = [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX];
        let mut first_fields = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
        first_fields[0] = 11;
        first_fields[1] = 12;
        private_logs[0] = PrivateLog::new(first_fields, 2);

        let mut second_fields = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
        second_fields[0] = 21;
        private_logs[1] = PrivateLog::new(second_fields, 1);

        let mut blob_fields = [0; PRIVATE_LOGS_BLOB_FIELDS_LENGTH];
        blob_fields[0] = 2;
        blob_fields[1] = 11;
        blob_fields[2] = 12;
        blob_fields[3] = 1;
        blob_fields[4] = 21;

        (private_logs, blob_fields)
    }

    #[test]
    fn valid_private_log_blob_hint_is_accepted() {
        let (private_logs, blob_fields) = private_logs_fixture();
        validate_private_logs_blob_fields(private_logs, 2, blob_fields, 5);
    }

    #[test(should_fail_with = "Incorrect private log length in blob data")]
    fn private_log_blob_hint_rejects_wrong_length_field() {
        let (private_logs, mut blob_fields) = private_logs_fixture();
        blob_fields[0] = 3;
        validate_private_logs_blob_fields(private_logs, 2, blob_fields, 5);
    }

    #[test(should_fail_with = "Incorrect private log field in blob data")]
    fn private_log_blob_hint_rejects_wrong_log_field() {
        let (private_logs, mut blob_fields) = private_logs_fixture();
        blob_fields[1] = 99;
        validate_private_logs_blob_fields(private_logs, 2, blob_fields, 5);
    }

    #[test(should_fail_with = "Incorrect private log length in blob data")]
    fn private_log_blob_hint_rejects_dropped_log() {
        let (private_logs, mut blob_fields) = private_logs_fixture();
        blob_fields[3] = 0;
        blob_fields[4] = 0;
        validate_private_logs_blob_fields(private_logs, 2, blob_fields, 3);
    }

    #[test(should_fail_with = "Incorrect private log length in blob data")]
    fn private_log_blob_hint_rejects_duplicated_log() {
        let (private_logs, mut blob_fields) = private_logs_fixture();
        blob_fields[3] = 2;
        blob_fields[4] = 11;
        blob_fields[5] = 12;
        validate_private_logs_blob_fields(private_logs, 2, blob_fields, 6);
    }

    #[test(should_fail_with = "Incorrect number of private log fields in blob data")]
    fn private_log_blob_hint_rejects_understated_count() {
        let (private_logs, blob_fields) = private_logs_fixture();
        validate_private_logs_blob_fields(private_logs, 1, blob_fields, 5);
    }

    #[test(should_fail_with = "Incorrect number of private log fields in blob data")]
    fn private_log_blob_hint_rejects_overstated_count() {
        let (private_logs, blob_fields) = private_logs_fixture();
        validate_private_logs_blob_fields(private_logs, 3, blob_fields, 5);
    }

    #[test(should_fail_with = "Private log length exceeds maximum")]
    fn private_log_blob_hint_rejects_oversized_log() {
        let mut private_logs = [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX];
        let mut fields: [Field; PRIVATE_LOG_SIZE_IN_FIELDS] = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
        for i in 0..fields.len() {
            fields[i] = (i + 1) as Field;
        }
        private_logs[0] = PrivateLog::new(fields, PRIVATE_LOG_SIZE_IN_FIELDS + 1);

        let mut blob_fields = [0; PRIVATE_LOGS_BLOB_FIELDS_LENGTH];
        blob_fields[0] = (PRIVATE_LOG_SIZE_IN_FIELDS + 1) as Field;
        for i in 0..fields.len() {
            blob_fields[i + 1] = fields[i];
        }
        validate_private_logs_blob_fields(
            private_logs,
            1,
            blob_fields,
            PRIVATE_LOG_SIZE_IN_FIELDS + 2,
        );
    }

    #[test(should_fail_with = "Contract class log length exceeds maximum")]
    fn contract_class_log_blob_encoding_rejects_oversized_log() {
        let mut logs = [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX];
        logs[0] = ContractClassLog {
            log: Log::new(
                [1; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS],
                CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1,
            ),
            contract_address: AztecAddress::from_field(1),
        };

        let _ = create_contract_class_logs_blob_fields(logs, 1);
    }

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
