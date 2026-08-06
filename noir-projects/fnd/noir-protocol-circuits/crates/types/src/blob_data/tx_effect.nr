use crate::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite, public_logs::PublicLogs,
    },
    constants::{
        DOM_SEP__TX_EFFECT_FIELD_HASH, DOM_SEP__TX_EFFECT_HASH, DOM_SEP__TX_EFFECT_LEAF,
        DOM_SEP__TX_EFFECTS_TREE, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    hash::{poseidon2_hash_subarray_with_separator, poseidon2_hash_with_separator},
    traits::{Empty, Serialize},
};
use super::tx_blob_data::{
    create_contract_class_logs_blob_fields, create_private_logs_blob_fields,
    create_public_data_writes_blob_fields, create_tx_start_marker, TxEffectArrayLengths,
};

#[derive(Eq, Serialize)]
pub struct TxEffect {
    pub revert_code: u8,
    pub tx_hash: Field,
    pub transaction_fee: Field,
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    pub public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub public_logs: PublicLogs,
    pub contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for TxEffect {
    fn empty() -> Self {
        TxEffect {
            revert_code: 0,
            tx_hash: 0,
            transaction_fee: 0,
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [0; MAX_L2_TO_L1_MSGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            public_logs: PublicLogs::empty(),
            contract_class_logs: [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}

/// The number of per-field sub-hashes that make up a tx effect hash: one per variable-length field of a `TxEffect`.
pub global NUM_TX_EFFECT_FIELD_HASHES: u32 = 7;

/// The number of fields hashed into a tx effect hash: the tx start marker, the transaction fee, and the per-field
/// sub-hashes.
pub global NUM_TX_EFFECT_HASH_FIELDS: u32 = 2 + NUM_TX_EFFECT_FIELD_HASHES;

/// Hashes one variable-length field of a tx effect over that field's slice of the blob encoding.
///
/// An empty field hashes to 0 rather than to a hash of nothing. This is unambiguous because every array count is
/// bound by the tx start marker, which is hashed alongside the sub-hashes.
fn compute_tx_effect_field_hash<let N: u32>(blob_fields: [Field; N], length: u32) -> Field {
    if length == 0 {
        0
    } else {
        poseidon2_hash_subarray_with_separator(blob_fields, length, DOM_SEP__TX_EFFECT_FIELD_HASH)
    }
}

/// The tx start marker and the per-field sub-hashes of a tx effect. Both are derived from the same per-field blob
/// encoding slices, so they are computed together.
fn compute_tx_effect_hash_inputs(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> (Field, [Field; NUM_TX_EFFECT_FIELD_HASHES]) {
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

    // The blob encoding opens with the tx start marker, the tx hash and the transaction fee.
    let num_blob_fields = 3
        + array_lengths.note_hashes
        + array_lengths.nullifiers
        + array_lengths.l2_to_l1_msgs
        + num_public_data_write_fields
        + num_private_log_fields
        + tx_effect.public_logs.length
        + num_contract_class_log_fields;

    // Each private log contributes a length field on top of its fields.
    let private_logs_length = num_private_log_fields - array_lengths.private_logs;

    let tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        private_logs_length,
        tx_effect.public_logs.length,
        tx_effect.contract_class_logs[0].log.length,
        tx_effect.revert_code,
    );

    let field_hashes = [
        compute_tx_effect_field_hash(tx_effect.note_hashes, array_lengths.note_hashes),
        compute_tx_effect_field_hash(tx_effect.nullifiers, array_lengths.nullifiers),
        compute_tx_effect_field_hash(tx_effect.l2_to_l1_msgs, array_lengths.l2_to_l1_msgs),
        compute_tx_effect_field_hash(public_data_write_fields, num_public_data_write_fields),
        compute_tx_effect_field_hash(private_log_fields, num_private_log_fields),
        compute_tx_effect_field_hash(tx_effect.public_logs.payload, tx_effect.public_logs.length),
        compute_tx_effect_field_hash(contract_class_log_fields, num_contract_class_log_fields),
    ];

    (tx_start_marker, field_hashes)
}

/// Hash committing to the full contents of a tx's effects.
///
/// The hash is structured rather than flat: each variable-length field is hashed on its own first, and this hash is
/// taken over those sub-hashes plus the small scalar fields inline. Proving a single field (e.g. one note hash)
/// therefore only requires the preimage of that field's sub-hash, with the other sub-hashes as opaque witnesses.
///
/// Each sub-hash preimage is that field's slice of the blob encoding (see `create_tx_blob_data`), over the actual
/// runtime length, so no new serialization format is introduced. The tx start marker binds the revert code, every
/// array count and the total blob field count; the transaction fee is small enough to inline. The tx hash is bound
/// at the leaf level instead (see `compute_tx_effect_leaf`).
pub fn compute_tx_effect_hash(tx_effect: TxEffect, array_lengths: TxEffectArrayLengths) -> Field {
    let (tx_start_marker, field_hashes) = compute_tx_effect_hash_inputs(tx_effect, array_lengths);

    let hash_inputs: [Field; NUM_TX_EFFECT_HASH_FIELDS] =
        [tx_start_marker, tx_effect.transaction_fee].concat(field_hashes);

    poseidon2_hash_with_separator(hash_inputs, DOM_SEP__TX_EFFECT_HASH)
}

/// This tx's leaf of the block's tx effects tree: a hash binding the tx hash to the hash of the tx's effects.
///
/// A holder of the block header can verify "tx X was included in this block and produced exactly effects E" with a
/// membership proof against `BlockHeader.tx_effects_tree_root`.
pub fn compute_tx_effect_leaf(tx_effect: TxEffect, array_lengths: TxEffectArrayLengths) -> Field {
    poseidon2_hash_with_separator(
        [tx_effect.tx_hash, compute_tx_effect_hash(tx_effect, array_lengths)],
        DOM_SEP__TX_EFFECT_LEAF,
    )
}

/// Combines the tx effects tree roots of two adjacent subtrees of txs, as the rollup tree is walked upwards.
///
/// Unlike `accumulate_out_hash`, zero roots are NOT skipped: there are no padding txs, so every leaf is a real tx
/// and the tree shape is a function of the number of txs alone. The separator differs from
/// [`DOM_SEP__TX_EFFECT_LEAF`], so an internal node can never be confused with a leaf.
pub fn accumulate_tx_effects_tree_root(left_root: Field, right_root: Field) -> Field {
    poseidon2_hash_with_separator([left_root, right_root], DOM_SEP__TX_EFFECTS_TREE)
}

mod tests {
    use crate::{
        abis::{
            contract_class_log::ContractClassLog, log::Log, private_log::PrivateLog,
            public_data_write::PublicDataWrite, public_logs::PublicLogs,
        },
        address::AztecAddress,
        constants::{
            DOM_SEP__TX_EFFECT_FIELD_HASH, DOM_SEP__TX_EFFECT_HASH, DOM_SEP__TX_EFFECT_LEAF,
            DOM_SEP__TX_EFFECTS_TREE, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS,
        },
        hash::poseidon2_hash_with_separator,
        traits::{Empty, FromField},
    };
    use crate::blob_data::tx_blob_data::create_tx_blob_data;
    use super::{
        accumulate_tx_effects_tree_root, compute_tx_effect_hash, compute_tx_effect_hash_inputs,
        compute_tx_effect_leaf, create_tx_start_marker, TxEffect, TxEffectArrayLengths,
    };

    /// Copies `items` into a zero-padded array of size `M`.
    fn pad_end<let N: u32, let M: u32>(items: [Field; N]) -> [Field; M] {
        let mut padded = [0; M];
        for i in 0..N {
            padded[i] = items[i];
        }
        padded
    }

    global TX_HASH: Field = 0x1234;
    global TRANSACTION_FEE: Field = 42;
    global REVERT_CODE: u8 = 1;
    global CONTRACT_CLASS_LOG_ADDRESS: Field = 77;
    global PUBLIC_LOG_ADDRESS: Field = 200;

    /// A tx effect with a couple of items in every field, small enough that the expected hashes can be written out
    /// by hand.
    fn small_fixture() -> (TxEffect, TxEffectArrayLengths) {
        let mut tx_effect = TxEffect::empty();
        tx_effect.revert_code = REVERT_CODE;
        tx_effect.tx_hash = TX_HASH;
        tx_effect.transaction_fee = TRANSACTION_FEE;
        tx_effect.note_hashes[0] = 11;
        tx_effect.note_hashes[1] = 12;
        tx_effect.nullifiers[0] = 21;
        tx_effect.l2_to_l1_msgs[0] = 31;
        tx_effect.public_data_writes[0] = PublicDataWrite { leaf_slot: 41, value: 42 };
        tx_effect.private_logs[0] = PrivateLog::new(pad_end([101, 102, 103]), 3);
        // A well-formed encoding of a single public log: `[num_fields, contract_address, ...fields]`. The TS mirror
        // of this fixture builds the payload out of a `PublicLog`, so an arbitrary payload could not be reproduced.
        tx_effect.public_logs = PublicLogs::new(pad_end([2, PUBLIC_LOG_ADDRESS, 201, 202]), 4);
        tx_effect.contract_class_logs[0] = ContractClassLog {
            log: Log::new(pad_end([301, 302]), 2),
            contract_address: AztecAddress::from_field(CONTRACT_CLASS_LOG_ADDRESS),
        };

        let array_lengths = TxEffectArrayLengths {
            note_hashes: 2,
            nullifiers: 1,
            l2_to_l1_msgs: 1,
            public_data_writes: 1,
            private_logs: 1,
            contract_class_logs: 1,
        };

        (tx_effect, array_lengths)
    }

    fn field_hash<let N: u32>(blob_fields: [Field; N]) -> Field {
        poseidon2_hash_with_separator(blob_fields, DOM_SEP__TX_EFFECT_FIELD_HASH)
    }

    /// The tx start marker of the fixture, computed independently of the code under test.
    fn small_fixture_tx_start_marker() -> Field {
        // 3 leading fields, 2 note hashes, 1 nullifier, 1 l2->l1 msg, 1 write (2 fields), 1 private log (1 length
        // field + 3 fields), 4 public log fields, 1 contract class log (1 address field + 2 fields).
        let num_blob_fields = 3 + 2 + 1 + 1 + 2 + 4 + 4 + 3;
        let (_, array_lengths) = small_fixture();
        create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            3, // private_logs_length
            4, // public_logs_length
            2, // contract_class_log_length
            REVERT_CODE,
        )
    }

    #[test]
    fn leaf_of_small_fixture_matches_hand_computed_value() {
        let (tx_effect, array_lengths) = small_fixture();

        let expected_tx_effect_hash = poseidon2_hash_with_separator(
            [
                small_fixture_tx_start_marker(),
                TRANSACTION_FEE,
                field_hash([11, 12]),
                field_hash([21]),
                field_hash([31]),
                field_hash([41, 42]),
                field_hash([3, 101, 102, 103]),
                field_hash([2, PUBLIC_LOG_ADDRESS, 201, 202]),
                field_hash([CONTRACT_CLASS_LOG_ADDRESS, 301, 302]),
            ],
            DOM_SEP__TX_EFFECT_HASH,
        );
        assert_eq(compute_tx_effect_hash(tx_effect, array_lengths), expected_tx_effect_hash);

        let expected_leaf = poseidon2_hash_with_separator(
            [TX_HASH, expected_tx_effect_hash],
            DOM_SEP__TX_EFFECT_LEAF,
        );
        assert_eq(compute_tx_effect_leaf(tx_effect, array_lengths), expected_leaf);
    }

    /// Pins the leaf of the fixture against the TypeScript implementation, which mirrors the fixture field for field.
    /// Both sides must agree: the archiver recomputes the tx effects tree root from the effects it decodes from blobs,
    /// and compares it against the root the rollup circuits put in the block header.
    #[test]
    fn leaf_of_small_fixture_matches_typescript() {
        let (tx_effect, array_lengths) = small_fixture();

        // Generated from yarn-project/stdlib/src/tx/tx_effect.test.ts
        let test_data_tx_effect_leaf =
            0x23123931ffdee54cf34fbf657b7817ad5fcae54bce508a739a01977591b991cc;

        assert_eq(compute_tx_effect_leaf(tx_effect, array_lengths), test_data_tx_effect_leaf);
    }

    /// The sub-hash preimages must be exactly the field's slice of the blob encoding. `create_tx_blob_data` checks
    /// the concatenated encoding against the tx effect independently of the per-field slice builders, so running it
    /// on the fixture pins the slices to the canonical layout.
    #[test]
    fn per_field_slices_concatenate_to_the_blob_encoding() {
        let (tx_effect, array_lengths) = small_fixture();

        let (blob_fields, num_blob_fields) = create_tx_blob_data(tx_effect, array_lengths);

        let expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] = pad_end([
            small_fixture_tx_start_marker(),
            TX_HASH,
            TRANSACTION_FEE,
            11,
            12,
            21,
            31,
            41,
            42,
            3,
            101,
            102,
            103,
            2,
            PUBLIC_LOG_ADDRESS,
            201,
            202,
            CONTRACT_CLASS_LOG_ADDRESS,
            301,
            302,
        ]);

        assert_eq(num_blob_fields, 20);
        assert_eq(blob_fields, expected_blob_fields);
    }

    #[test]
    fn empty_effect_has_zero_field_hashes() {
        let tx_effect = TxEffect::empty();
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };

        let (tx_start_marker, field_hashes) =
            compute_tx_effect_hash_inputs(tx_effect, array_lengths);
        assert_eq(field_hashes, [0; 7]);

        // The marker still binds the (zero) counts and the 3 leading blob fields, so the tx effect hash of an
        // effect-less tx is not a hash of nothing.
        let expected_tx_effect_hash = poseidon2_hash_with_separator(
            [tx_start_marker, 0, 0, 0, 0, 0, 0, 0, 0],
            DOM_SEP__TX_EFFECT_HASH,
        );
        assert_eq(compute_tx_effect_hash(tx_effect, array_lengths), expected_tx_effect_hash);
    }

    #[test]
    fn empty_field_hashes_to_zero_while_others_do_not() {
        let mut tx_effect = TxEffect::empty();
        tx_effect.note_hashes[0] = 11;
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 1,
            nullifiers: 0, // Empty, unlike the note hashes.
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };

        let (_, field_hashes) = compute_tx_effect_hash_inputs(tx_effect, array_lengths);

        assert_eq(field_hashes[0], field_hash([11]));
        assert(field_hashes[0] != 0);
        // Every other field is empty.
        for i in 1..field_hashes.len() {
            assert_eq(field_hashes[i], 0);
        }
    }

    #[test]
    fn array_counts_are_bound_by_the_tx_start_marker() {
        // One note hash, then a trailing zero note hash counted as real. Reading the second entry as data or as
        // padding must not give the same effect hash, even though the field's payload is unchanged.
        let mut tx_effect = TxEffect::empty();
        tx_effect.note_hashes[0] = 11;

        let mut array_lengths = TxEffectArrayLengths {
            note_hashes: 1,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };
        let one_note_hash = compute_tx_effect_hash(tx_effect, array_lengths);

        array_lengths.note_hashes = 2;
        let two_note_hashes = compute_tx_effect_hash(tx_effect, array_lengths);

        assert(one_note_hash != two_note_hashes);
    }

    #[test]
    fn leaf_effect_hash_and_field_hashes_are_all_distinct() {
        let (tx_effect, array_lengths) = small_fixture();

        let leaf = compute_tx_effect_leaf(tx_effect, array_lengths);
        let tx_effect_hash = compute_tx_effect_hash(tx_effect, array_lengths);
        let (tx_start_marker, field_hashes) =
            compute_tx_effect_hash_inputs(tx_effect, array_lengths);

        assert(leaf != tx_effect_hash);
        assert(leaf != TX_HASH);
        assert(tx_effect_hash != TX_HASH);
        assert(leaf != tx_start_marker);
        assert(tx_effect_hash != tx_start_marker);

        for i in 0..field_hashes.len() {
            assert(field_hashes[i] != 0);
            assert(field_hashes[i] != leaf);
            assert(field_hashes[i] != tx_effect_hash);
            assert(field_hashes[i] != TX_HASH);
            for j in 0..i {
                assert(field_hashes[i] != field_hashes[j]);
            }
        }
    }

    #[test]
    fn tx_effects_tree_node_is_domain_separated_from_the_leaf() {
        let left = 111;
        let right = 222;

        assert_eq(
            accumulate_tx_effects_tree_root(left, right),
            poseidon2_hash_with_separator([left, right], DOM_SEP__TX_EFFECTS_TREE),
        );
        // Zero roots are not skipped, unlike `accumulate_out_hash`.
        assert(accumulate_tx_effects_tree_root(left, 0) != left);
        assert(accumulate_tx_effects_tree_root(0, right) != right);
        // A node can never be mistaken for a leaf.
        assert(
            accumulate_tx_effects_tree_root(left, right)
                != poseidon2_hash_with_separator([left, right], DOM_SEP__TX_EFFECT_LEAF),
        );
    }
}
